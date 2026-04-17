"""
Webhook dispatch module — synchronous (called from APScheduler monitor context).

All functions are synchronous because monitor.py uses a sync APScheduler executor.
Never convert to async without also updating the monitor callers.
"""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.database import SessionLocal
from app.models import Webhook, WebhookTypeEnum

logger = logging.getLogger(__name__)

_OFFLINE_EVENTS = frozenset({"SERVER_OFFLINE", "PROJECT_OFFLINE"})
_COLOR_OFFLINE = "#dc2626"
_COLOR_ONLINE = "#16a34a"
_TEAMS_COLOR_OFFLINE = "dc2626"
_TEAMS_COLOR_ONLINE = "16a34a"
_HTTP_TIMEOUT = 10.0
_RESPONSE_TRUNCATE_LEN = 500


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def _is_offline_event(event_type: str) -> bool:
    return event_type in _OFFLINE_EVENTS


def _status_label(event_type: str) -> str:
    return "offline" if _is_offline_event(event_type) else "online"


def _event_title(event_type: str, resource_type: str) -> str:
    """Convert 'SERVER_OFFLINE' → 'Server Offline'."""
    parts = event_type.split("_")
    # Use last word as the action (OFFLINE/ONLINE); combine with resource_type
    action = parts[-1].title() if parts else ""
    return f"{resource_type.title()} {action}"


def _build_generic_payload(
    event_type: str,
    resource_type: str,
    resource_name: str,
    resource_data: dict[str, Any],
) -> dict[str, Any]:
    """Build a plain JSON envelope suitable for generic HTTP endpoints."""
    extra = {k: v for k, v in resource_data.items() if k not in ("id", "name")}
    return {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "resource": {
            "type": resource_type,
            "id": resource_data.get("id"),
            "name": resource_name,
            **extra,
        },
        "message": (
            f"{resource_type.title()} {resource_name} is {_status_label(event_type)}"
        ),
    }


def _build_slack_payload(
    event_type: str,
    resource_type: str,
    resource_name: str,
    resource_data: dict[str, Any],
) -> dict[str, Any]:
    """Build a Slack Block Kit payload with attachments."""
    color = _COLOR_OFFLINE if _is_offline_event(event_type) else _COLOR_ONLINE
    title = _event_title(event_type, resource_type)
    timestamp = datetime.now(timezone.utc).isoformat()

    # Determine IP/domain label from resource_data
    ip_or_domain = (
        resource_data.get("ip_address")
        or resource_data.get("host")
        or resource_data.get("domain")
        or "N/A"
    )

    return {
        "attachments": [
            {
                "color": color,
                "blocks": [
                    {
                        "type": "header",
                        "text": {
                            "type": "plain_text",
                            "text": title,
                            "emoji": True,
                        },
                    },
                    {
                        "type": "section",
                        "fields": [
                            {
                                "type": "mrkdwn",
                                "text": f"*Name:*\n{resource_name}",
                            },
                            {
                                "type": "mrkdwn",
                                "text": f"*IP / Domain:*\n{ip_or_domain}",
                            },
                        ],
                    },
                    {
                        "type": "context",
                        "elements": [
                            {
                                "type": "mrkdwn",
                                "text": f"Triggered at {timestamp}",
                            }
                        ],
                    },
                ],
            }
        ]
    }


def _build_teams_payload(
    event_type: str,
    resource_type: str,
    resource_name: str,
    resource_data: dict[str, Any],
) -> dict[str, Any]:
    """Build a Microsoft Teams MessageCard payload."""
    theme_color = (
        _TEAMS_COLOR_OFFLINE if _is_offline_event(event_type) else _TEAMS_COLOR_ONLINE
    )
    status = _status_label(event_type)
    summary = f"{resource_type.title()} {resource_name} is {status}"
    title = _event_title(event_type, resource_type)

    ip_or_domain = (
        resource_data.get("ip_address")
        or resource_data.get("host")
        or resource_data.get("domain")
        or "N/A"
    )

    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": theme_color,
        "summary": summary,
        "sections": [
            {
                "activityTitle": title,
                "facts": [
                    {"name": "Name", "value": resource_name},
                    {"name": "IP / Domain", "value": ip_or_domain},
                    {"name": "Status", "value": status.upper()},
                ],
            }
        ],
    }


def _select_builder(webhook_type: WebhookTypeEnum):
    """Return the appropriate payload builder for the webhook type."""
    if webhook_type == WebhookTypeEnum.slack:
        return _build_slack_payload
    if webhook_type == WebhookTypeEnum.teams:
        return _build_teams_payload
    return _build_generic_payload


# ---------------------------------------------------------------------------
# HMAC signature
# ---------------------------------------------------------------------------

def _compute_signature(payload_bytes: bytes, secret: str) -> str:
    """Compute HMAC-SHA256 signature and return 'sha256=<hex_digest>'."""
    digest = hmac.new(
        secret.encode("utf-8"),
        msg=payload_bytes,
        digestmod=hashlib.sha256,
    ).hexdigest()
    return f"sha256={digest}"


# ---------------------------------------------------------------------------
# Sync dispatcher — fire-and-forget (used by monitor)
# ---------------------------------------------------------------------------

def dispatch_webhooks_sync(
    event_type: str,
    resource_type: str,
    resource_name: str,
    resource_data: dict[str, Any],
    project_ids: list[str] | None = None,
) -> None:
    """
    Query active webhooks subscribed to event_type and POST each one.

    When project_ids is provided, only webhooks scoped to those projects
    (or global webhooks with no project scope) are dispatched.

    Designed for fire-and-forget use from APScheduler sync jobs.
    Never raises — all errors are logged.
    """
    db = SessionLocal()
    try:
        webhooks = (
            db.query(Webhook).filter(Webhook.is_active == True).all()  # noqa: E712
        )
        # Filter by event type AND project scope
        matching = []
        for w in webhooks:
            if event_type not in (w.events or []):
                continue
            webhook_pids = {str(p.id) for p in w.projects}
            if not webhook_pids:
                matching.append(w)  # Global — no project filter
            elif project_ids and webhook_pids & set(project_ids):
                matching.append(w)  # Scoped — event project matches

        if not matching:
            return

        with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
            for webhook in matching:
                _dispatch_one(
                    client=client,
                    webhook=webhook,
                    event_type=event_type,
                    resource_type=resource_type,
                    resource_name=resource_name,
                    resource_data=resource_data,
                    update_record=True,
                )

        db.commit()
    except Exception:
        logger.exception(
            "dispatch_webhooks_sync: unexpected error for event=%s", event_type
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Single dispatch — used by the test endpoint (router handles DB update)
# ---------------------------------------------------------------------------

def dispatch_single_webhook_sync(
    webhook: Webhook,
    event_type: str,
    resource_type: str,
    resource_name: str,
    resource_data: dict[str, Any],
) -> tuple[bool, int, str]:
    """
    Dispatch one webhook and return (success, status_code, response_body).

    Does NOT update the webhook record — the calling router is responsible.
    Does NOT suppress exceptions — let them propagate to the router.
    """
    with httpx.Client(timeout=_HTTP_TIMEOUT) as client:
        return _dispatch_one(
            client=client,
            webhook=webhook,
            event_type=event_type,
            resource_type=resource_type,
            resource_name=resource_name,
            resource_data=resource_data,
            update_record=False,
        )


# ---------------------------------------------------------------------------
# Shared internal dispatch helper
# ---------------------------------------------------------------------------

def _dispatch_one(
    client: httpx.Client,
    webhook: Webhook,
    event_type: str,
    resource_type: str,
    resource_name: str,
    resource_data: dict[str, Any],
    update_record: bool,
) -> tuple[bool, int, str]:
    """
    Build payload, send HTTP POST, optionally update the webhook ORM record.

    Returns (success, status_code, truncated_response_body).
    When update_record=False, exceptions are not caught here.
    """
    builder = _select_builder(webhook.type)
    payload = builder(event_type, resource_type, resource_name, resource_data)
    payload_bytes = json.dumps(payload, default=str).encode("utf-8")

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if webhook.secret:
        headers["X-Webhook-Signature"] = _compute_signature(
            payload_bytes, webhook.secret
        )

    try:
        response = client.post(webhook.url, content=payload_bytes, headers=headers)
        success = response.is_success
        status_code = response.status_code
        body = response.text[:_RESPONSE_TRUNCATE_LEN]

        if update_record:
            webhook.last_triggered_at = datetime.now(timezone.utc)
            webhook.last_status_code = status_code
            webhook.last_error = None if success else f"HTTP {status_code}: {body}"

        return success, status_code, body

    except Exception as exc:
        error_msg = str(exc)[:_RESPONSE_TRUNCATE_LEN]
        logger.warning(
            "Webhook %s (%s) failed: %s", webhook.name, webhook.url, error_msg
        )

        if update_record:
            webhook.last_triggered_at = datetime.now(timezone.utc)
            webhook.last_status_code = 0
            webhook.last_error = error_msg

        if not update_record:
            # Propagate to router for test endpoint
            raise

        return False, 0, error_msg
