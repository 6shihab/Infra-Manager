import multiprocessing
import os

# Gunicorn configuration file
# https://docs.gunicorn.org/en/stable/configure.html

bind = "0.0.0.0:8000"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"
keepalive = 5
timeout = 120
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
