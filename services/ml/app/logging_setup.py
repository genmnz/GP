"""Structured logging.

Every inference and every equation evaluation is logged as a single JSON line,
so the whole data flow is auditable (and greppable) end to end.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

from app.config import settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # attach structured context passed via `extra={"data": {...}}`
        data = getattr(record, "data", None)
        if data is not None:
            payload["data"] = data
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_configured = False


def configure() -> None:
    global _configured
    if _configured:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level.upper())
    _configured = True


def get_logger(name: str) -> logging.Logger:
    configure()
    return logging.getLogger(name)


def log_event(logger: logging.Logger, msg: str, **data: Any) -> None:
    """Log a structured event: `log_event(log, "infer", model="traffic", conf=0.9)`."""
    logger.info(msg, extra={"data": data})
