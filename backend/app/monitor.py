import asyncio
import logging
import socket
import httpx
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Project, Server, AuditLog, DatabaseInfo, Component
from app.config import settings
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import timedelta

logger = logging.getLogger(__name__)

def check_tcp_port(ip: str, port: int, timeout: int = 3) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

async def check_server_online(server: Server) -> bool:
    loop = asyncio.get_running_loop()
    for port in [22, 80, 443]:
        is_open = await loop.run_in_executor(None, check_tcp_port, server.ip_address, port)
        if is_open:
            return True
    return False

async def check_project_online(project: Project) -> bool:
    if not project.primary_domain:
        return False
    
    url = project.primary_domain
    if not url.startswith('http'):
        url = f"https://{url}"
        
    try:
        async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
            response = await client.get(url)
            # Both 2xx and 3xx are considered online signals, 4xx/5xx still mean it answered, 
            # let's consider anything returning a response as "online" in a broad networking sense
            # but ideally 200-499 means the application is up to answer.
            return True 
    except httpx.RequestError:
        # Fallback to plain http
        if not project.primary_domain.startswith('http'):
            try:
                url_http = f"http://{project.primary_domain}"
                async with httpx.AsyncClient(timeout=5.0) as client:
                    await client.get(url_http)
                    return True
            except:
                return False
        return False

async def run_uptime_checks():
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        logger.info("Running Uptime Health Checks...")
        
        # Check Servers
        servers = db.query(Server).all()
        for server in servers:
            is_online = await check_server_online(server)
            server.is_online = is_online
            server.last_checked_at = now
            
        # Check Projects
        projects = db.query(Project).all()
        for project in projects:
            if project.primary_domain:
                is_online = await check_project_online(project)
                project.is_online = is_online
            else:
                project.is_online = None
            project.last_checked_at = now
            
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception("Error in uptime checks: %s", e)
    finally:
        db.close()

async def cleanup_audit_logs():
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        retention_days = settings.audit_log_retention_days
        cutoff_date = now - timedelta(days=retention_days)
        logger.info("Running Audit Log Cleanup (deleting logs older than %s)...", cutoff_date)
        
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
        now = datetime.utcnow()
        # Hardcode 30 days or use settings
        cutoff_date = now - timedelta(days=30)
        logger.info("Running Soft Delete Cleanup (deleting records older than %s)...", cutoff_date)
        
        # Delete children first to avoid foreign key constraint violations
        deleted_servers = db.query(Server).filter(Server.is_deleted == True, Server.deleted_at < cutoff_date).delete()
        deleted_dbs = db.query(DatabaseInfo).filter(DatabaseInfo.is_deleted == True, DatabaseInfo.deleted_at < cutoff_date).delete()
        deleted_comps = db.query(Component).filter(Component.is_deleted == True, Component.deleted_at < cutoff_date).delete()
        
        # Delete parents last
        deleted_projects = db.query(Project).filter(Project.is_deleted == True, Project.deleted_at < cutoff_date).delete()
        
        db.commit()
        total_deleted = deleted_projects + deleted_servers + deleted_dbs + deleted_comps
        if total_deleted > 0:
            logger.info("Permanently deleted %d soft-deleted records.", total_deleted)
    except Exception as e:
        db.rollback()
        logger.exception("Error in soft delete cleanup: %s", e)
    finally:
        db.close()

def start_scheduler():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_uptime_checks, 'interval', minutes=2)
    scheduler.add_job(cleanup_audit_logs, 'interval', hours=24)
    scheduler.add_job(cleanup_soft_deleted_records, 'interval', hours=24)
    scheduler.start()

