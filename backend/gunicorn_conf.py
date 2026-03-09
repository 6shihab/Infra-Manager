import multiprocessing
import os

# Gunicorn configuration file
# https://docs.gunicorn.org/en/stable/configure.html

bind = "0.0.0.0:8000"
# UvicornWorker is async — a single worker handles thousands of concurrent requests
# via the event loop. Multiple workers would each start their own APScheduler instance,
# causing redundant monitor cycles and DB write conflicts.
workers = 1
worker_class = "uvicorn.workers.UvicornWorker"
keepalive = 5
timeout = 120
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
