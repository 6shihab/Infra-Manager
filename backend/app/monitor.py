import asyncio
import socket
import httpx
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Project, Server, AuditLog
from app.config import settings
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import timedelta

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
        print(f"[{now}] Running Uptime Health Checks...")
        
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
        print(f"Error in uptime checks: {e}")
    finally:
        db.close()

async def cleanup_audit_logs():
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        retention_days = settings.audit_log_retention_days
        cutoff_date = now - timedelta(days=retention_days)
        print(f"[{now}] Running Audit Log Cleanup (Deleting logs older than {cutoff_date})...")
        
        deleted = db.query(AuditLog).filter(AuditLog.timestamp < cutoff_date).delete()
        db.commit()
        if deleted > 0:
            print(f"[{now}] Deleted {deleted} old audit logs.")
    except Exception as e:
        db.rollback()
        print(f"Error in audit log cleanup: {e}")
    finally:
        db.close()

def start_scheduler():
    scheduler = AsyncIOScheduler()
    scheduler.add_job(run_uptime_checks, 'interval', minutes=2)
    scheduler.add_job(cleanup_audit_logs, 'interval', hours=24)
    scheduler.start()

