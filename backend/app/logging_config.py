import logging
import sys


def setup_logging(log_level: str = "INFO") -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    fmt = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
    logging.basicConfig(
        level=level,
        format=fmt,
        stream=sys.stdout,
        force=True,
    )
    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
