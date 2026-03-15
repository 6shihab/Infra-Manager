import asyncio
import concurrent.futures
import logging
import socket
import uuid
import httpx
from datetime import datetime, timezone, timedelta
from sqlalchemy import update as sa_update, select
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Project, Server, AuditLog, DatabaseEngine, Component, ProjectGroupAccess, ProjectServer, user_group_link
from app.config import settings
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)


def _project_member_ids(db: Session, project_id: uuid.UUID) -> list[uuid.UUID]:
    from app.models import Project as ProjectModel
    project = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    creator_id = project.created_by if project and project.created_by else None

    accesses = db.query(ProjectGroupAccess).filter(
        ProjectGroupAccess.project_id == project_id
    ).all()
    group_ids = [a.group_id for a in accesses]

    user_ids: set[uuid.UUID] = set()
    if creator_id:
        user_ids.add(creator_id)
    if group_ids:
        rows = db.query(user_group_link.c.user_id).filter(
            user_group_link.c.group_id.in_(group_ids)
        ).distinct().all()
        user_ids.update(r[0] for r in rows)

    return list(user_ids)


# Dedicated thread pool for TCP checks — isolated from the default asyncio executor
# so monitor socket threads never compete with API worker threads.
_monitor_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=20, thread_name_prefix="monitor-tcp"
)


def check_tcp_port(ip: str, port: int, timeout: int = 3) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


async def check_server_online(server: Server) -> bool:
    """Check all 3 ports in parallel; returns True if any port responds."""
    loop = asyncio.get_running_loop()
    results = await asyncio.gather(
        loop.run_in_executor(_monitor_executor, check_tcp_port, server.ip_address, 22),
        loop.run_in_executor(_monitor_executor, check_tcp_port, server.ip_address, 80),
        loop.run_in_executor(_monitor_executor, check_tcp_port, server.ip_address, 443),
    )
    return any(results)


async def check_project_online(project: Project) -> bool:
    if not project.primary_domain:
        return False

    url = project.primary_domain
    if not url.startswith('http'):
        url = f"https://{url}"

    try:
        async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
            await client.get(url)
            return True
    except httpx.RequestError:
        # Fallback to plain HTTP
        if not project.primary_domain.startswith('http'):
            try:
                url_http = f"http://{project.primary_domain}"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.get(url_http)
                    return True
            except Exception:
                return False
        return False


async def run_uptime_checks():
    db: Session = SessionLocal()
    try:
        start = datetime.now(timezone.utc)
        logger.info("Running uptime health checks...")

        # Only check active (non-deleted) resources
        servers = db.query(Server).filter(Server.is_deleted == False).all()
        projects = db.query(Project).filter(Project.is_deleted == False).all()

        # Run all server checks and all project checks concurrently.
        # return_exceptions=True ensures one bad host doesn't abort the rest.
        server_results, project_results = await asyncio.gather(
            asyncio.gather(*[check_server_online(s) for s in servers], return_exceptions=True),
            asyncio.gather(*[check_project_online(p) for p in projects], return_exceptions=True),
        )

        now = datetime.now(timezone.utc)

        # Build bulk update payloads
        server_rows = [
            {
                "id": s.id,
                "is_online": bool(result) if not isinstance(result, Exception) else None,
                "last_checked_at": now,
            }
            for s, result in zip(servers, server_results)
        ]
        project_rows = [
            {
                "id": p.id,
                "is_online": bool(result) if p.primary_domain and not isinstance(result, Exception) else None,
                "last_checked_at": now,
            }
            for p, result in zip(projects, project_results)
        ]

        # Detect offline transitions before the bulk update overwrites current state
        newly_offline_servers = [
            s for s, result in zip(servers, server_results)
            if s.is_online is True
            and not isinstance(result, Exception)
            and bool(result) is False
        ]
        newly_offline_projects = [
            p for p, result in zip(projects, project_results)
            if p.primary_domain
            and p.is_online is True
            and not isinstance(result, Exception)
            and bool(result) is False
        ]

        if server_rows:
            db.execute(sa_update(Server), server_rows)
        if project_rows:
            db.execute(sa_update(Project), project_rows)
        db.commit()

        # Publish offline events after commit
        if newly_offline_servers or newly_offline_projects:
            try:
                from app.notifications import bus
                for server in newly_offline_servers:
                    # Servers are shared across projects — notify users in any project that has this server
                    project_ids_with_server = [
                        r[0] for r in db.execute(
                            select(ProjectServer.project_id).where(ProjectServer.server_id == server.id)
                        ).all()
                    ]
                    notified: set[uuid.UUID] = set()
                    for pid in project_ids_with_server:
                        for uid in _project_member_ids(db, pid):
                            notified.add(uid)
                    if notified:
                        bus.publish_to_all(list(notified), {
                            "id": f"srv-offline-{server.id}-{int(now.timestamp())}",
                            "type": "SERVER_OFFLINE",
                            "action": "OFFLINE",
                            "resource_type": "Server",
                            "resource_name": server.name,
                            "timestamp": now.isoformat(),
                            "actor_name": None,
                        })

                for project in newly_offline_projects:
                    member_ids = _project_member_ids(db, project.id)
                    if member_ids:
                        bus.publish_to_all(member_ids, {
                            "id": f"proj-offline-{project.id}-{int(now.timestamp())}",
                            "type": "PROJECT_OFFLINE",
                            "action": "OFFLINE",
                            "resource_type": "Project",
                            "resource_name": project.name,
                            "timestamp": now.isoformat(),
                            "actor_name": None,
                        })
            except Exception:
                logger.exception("Failed to publish offline notifications")

        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logger.info(
            "Uptime checks done in %.1fs — %d servers, %d projects",
            elapsed, len(servers), len(projects),
        )
    except Exception as e:
        db.rollback()
        logger.exception("Error in uptime checks: %s", e)
    finally:
        db.close()


async def cleanup_audit_logs():
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        retention_days = settings.audit_log_retention_days
        cutoff_date = now - timedelta(days=retention_days)
        logger.info("Running audit log cleanup (deleting logs older than %s)...", cutoff_date)

        deleted = db.query(AuditLog).filter(AuditLog.timestamp < cutoff_date).delete()
        db.commit()
        if deleted > 0:
            logger.info("Deleted %d old audit logs.", deleted)
    except Exception as e:
        db.rollback()
        logger.exception("Error in audit log cleanup: %s", e)
    finally:
        db.close()


async def cleanup_soft_deleted_records():
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff_date = now - timedelta(days=30)
        logger.info("Running soft-delete cleanup (permanently deleting records older than %s)...", cutoff_date)

        # Delete children before parents to avoid FK violations
        deleted_servers = db.query(Server).filter(Server.is_deleted == True, Server.deleted_at < cutoff_date).delete()
        deleted_dbs = db.query(DatabaseEngine).filter(DatabaseEngine.is_deleted == True, DatabaseEngine.deleted_at < cutoff_date).delete()
        deleted_comps = db.query(Component).filter(Component.is_deleted == True, Component.deleted_at < cutoff_date).delete()
        deleted_projects = db.query(Project).filter(Project.is_deleted == True, Project.deleted_at < cutoff_date).delete()

        db.commit()
        total_deleted = deleted_projects + deleted_servers + deleted_dbs + deleted_comps
        if total_deleted > 0:
            logger.info("Permanently deleted %d soft-deleted records.", total_deleted)
    except Exception as e:
        db.rollback()
        logger.exception("Error in soft-delete cleanup: %s", e)
    finally:
        db.close()


def start_scheduler():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_uptime_checks,
        'interval',
        minutes=2,
        max_instances=1,      # never run two cycles concurrently
        coalesce=True,        # skip queued missed runs, run once
        misfire_grace_time=30,
    )
    scheduler.add_job(cleanup_audit_logs, 'interval', hours=24, max_instances=1, coalesce=True)
    scheduler.add_job(cleanup_soft_deleted_records, 'interval', hours=24, max_instances=1, coalesce=True)
    scheduler.start()
