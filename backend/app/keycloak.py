"""
Keycloak OIDC integration module.

Handles:
- JWKS fetching and caching for RS256 JWT validation
- Token validation (issuer, audience, expiry)
- Admin API client for user provisioning and management
"""

import time
import logging
from typing import Any

import httpx
from jose import jwt, jwk, JWTError
from jose.utils import base64url_decode

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JWKS Cache
# ---------------------------------------------------------------------------

class KeycloakJWKS:
    """Fetches and caches the Keycloak JWKS (JSON Web Key Set)."""

    def __init__(self, issuer_url: str):
        self._jwks_uri = f"{issuer_url}/protocol/openid-connect/certs"
        self._keys: dict[str, dict] = {}
        self._last_refresh: float = 0
        self._ttl: float = 6 * 3600  # 6 hours

    def _needs_refresh(self) -> bool:
        return time.time() - self._last_refresh > self._ttl

    def refresh(self) -> None:
        """Fetch JWKS from Keycloak and cache the keys by kid."""
        try:
            resp = httpx.get(self._jwks_uri, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            self._keys = {k["kid"]: k for k in data.get("keys", [])}
            self._last_refresh = time.time()
            logger.info("Refreshed JWKS from %s (%d keys)", self._jwks_uri, len(self._keys))
        except Exception:
            logger.exception("Failed to fetch JWKS from %s", self._jwks_uri)
            raise

    def get_key(self, kid: str) -> dict:
        """Return the JWK for the given kid, refreshing if needed."""
        if self._needs_refresh() or kid not in self._keys:
            self.refresh()
        if kid not in self._keys:
            raise ValueError(f"Key {kid} not found in JWKS")
        return self._keys[kid]


# Singleton JWKS instance — initialised lazily on first use
_jwks: KeycloakJWKS | None = None


def _get_jwks() -> KeycloakJWKS:
    global _jwks
    if _jwks is None:
        issuer_url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}"
        _jwks = KeycloakJWKS(issuer_url)
    return _jwks


# ---------------------------------------------------------------------------
# Token Validation
# ---------------------------------------------------------------------------

def validate_keycloak_token(token: str) -> dict[str, Any]:
    """
    Validate a Keycloak-issued JWT.

    Returns the decoded payload on success.
    Raises JWTError or ValueError on failure.
    """
    jwks_cache = _get_jwks()
    # Use public URL for issuer validation (matches what the browser sees)
    public_url = settings.keycloak_public_url or settings.keycloak_url
    issuer = f"{public_url}/realms/{settings.keycloak_realm}"

    # Decode header to find kid
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise ValueError("Invalid token header")

    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Token header missing kid")

    # Get the signing key
    key_data = jwks_cache.get_key(kid)

    # Decode and validate
    # Keycloak public-client tokens use 'azp' (authorized party) instead of 'aud',
    # so we disable aud verification and check azp manually.
    payload = jwt.decode(
        token,
        key_data,
        algorithms=["RS256"],
        issuer=issuer,
        options={
            "verify_aud": False,
            "verify_iss": True,
            "verify_exp": True,
            "verify_iat": True,
        },
    )

    # Verify authorized party matches our frontend client
    azp = payload.get("azp")
    if azp and azp != settings.keycloak_frontend_client_id:
        raise ValueError(f"Token azp '{azp}' does not match expected client")

    return payload


# ---------------------------------------------------------------------------
# Keycloak Admin API Client
# ---------------------------------------------------------------------------

class KeycloakAdmin:
    """Thin wrapper around the Keycloak Admin REST API using Client Credentials."""

    def __init__(self):
        self._base = f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}"
        self._token_url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token"
        self._access_token: str | None = None
        self._token_expires: float = 0

    def _get_token(self) -> str:
        """Obtain a client-credentials access token for the backend service account."""
        if self._access_token and time.time() < self._token_expires:
            return self._access_token

        resp = httpx.post(
            self._token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.keycloak_client_id,
                "client_secret": settings.keycloak_client_secret,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data["access_token"]
        self._token_expires = time.time() + data.get("expires_in", 300) - 30
        return self._access_token

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._get_token()}"}

    # -- User Management --

    def create_user(
        self,
        email: str,
        first_name: str = "",
        last_name: str = "",
        enabled: bool = True,
        temporary_password: str | None = None,
        require_password_update: bool = True,
    ) -> str:
        """Create a user in Keycloak. Returns the Keycloak user ID."""
        payload: dict[str, Any] = {
            "username": email,
            "email": email,
            "emailVerified": True,
            "enabled": enabled,
            "firstName": first_name,
            "lastName": last_name,
        }

        if temporary_password:
            payload["credentials"] = [{
                "type": "password",
                "value": temporary_password,
                "temporary": require_password_update,
            }]
        elif require_password_update:
            payload["requiredActions"] = ["UPDATE_PASSWORD"]

        resp = httpx.post(
            f"{self._base}/users",
            json=payload,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()

        # Keycloak returns 201 with Location header containing the user ID
        location = resp.headers.get("Location", "")
        keycloak_id = location.rsplit("/", 1)[-1] if location else ""

        if not keycloak_id:
            # Fallback: search by email
            keycloak_id = self.get_user_id_by_email(email) or ""

        # Ensure user can access the Keycloak Account Console (MFA, passkeys)
        if keycloak_id:
            try:
                self.ensure_account_console_access(keycloak_id)
            except Exception:
                logger.warning("Failed to assign account console roles to %s", keycloak_id)

        return keycloak_id

    def get_user_id_by_email(self, email: str) -> str | None:
        """Look up a Keycloak user by email. Returns their ID or None."""
        resp = httpx.get(
            f"{self._base}/users",
            params={"email": email, "exact": "true"},
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        users = resp.json()
        return users[0]["id"] if users else None

    def assign_realm_role(self, user_id: str, role_name: str) -> None:
        """Assign a realm-level role to a user."""
        # First, get the role representation
        resp = httpx.get(
            f"{self._base}/roles/{role_name}",
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        role = resp.json()

        # Assign the role
        resp = httpx.post(
            f"{self._base}/users/{user_id}/role-mappings/realm",
            json=[role],
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()

    def set_user_password(self, user_id: str, password: str, temporary: bool = False) -> None:
        """Set or reset a user's password."""
        resp = httpx.put(
            f"{self._base}/users/{user_id}",
            json={
                "credentials": [{
                    "type": "password",
                    "value": password,
                    "temporary": temporary,
                }]
            },
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()

    def delete_user(self, user_id: str) -> None:
        """Delete a user from Keycloak."""
        resp = httpx.delete(
            f"{self._base}/users/{user_id}",
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()

    def update_user(self, user_id: str, **fields: Any) -> None:
        """Update user attributes in Keycloak."""
        resp = httpx.put(
            f"{self._base}/users/{user_id}",
            json=fields,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()

    def ensure_account_console_access(self, user_id: str) -> None:
        """Ensure user has manage-account + view-profile roles for Account Console access."""
        # Find the 'account' client ID
        resp = httpx.get(
            f"{self._base}/clients",
            params={"clientId": "account"},
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        clients = resp.json()
        if not clients:
            logger.warning("Account client not found in Keycloak")
            return
        account_client_uuid = clients[0]["id"]

        # Get available roles for this client
        resp = httpx.get(
            f"{self._base}/users/{user_id}/role-mappings/clients/{account_client_uuid}/available",
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        available = resp.json()

        # Filter for the roles we need
        needed = [r for r in available if r["name"] in ("manage-account", "view-profile")]
        if not needed:
            return  # Already assigned

        resp = httpx.post(
            f"{self._base}/users/{user_id}/role-mappings/clients/{account_client_uuid}",
            json=needed,
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        logger.info("Assigned account console roles to user %s", user_id)


# Module-level singleton
keycloak_admin = KeycloakAdmin()
