"""Central configuration for the ML service.

Single source of truth for labels, ordinal weights, the signal-timing
constants, and runtime paths. These MUST stay in sync with the TypeScript
side (apps/server/src/types.ts and traffic/signal-engine.ts).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# --- Congestion taxonomy (the 4-class traffic model) ---
TRAFFIC_LABELS: tuple[str, ...] = ("empty", "low", "high", "jam")

# Ordinal weights — mirrors WEIGHTS in apps/server/src/types.ts.
WEIGHTS: dict[str, float] = {"empty": 1.0, "low": 2.0, "high": 3.0, "jam": 4.0}
W_MAX: float = 4.0


@dataclass(frozen=True)
class SignalConstants:
    """Bounded, demand-proportional signal-timing constants (mirror signal-engine.ts)."""

    c_min: int = 40  # cycle floor (s)
    c_max: int = 120  # cycle ceiling (s)
    g_min: int = 7  # minimum green per approach (s)
    lost: int = 4  # clearance per phase (s)


@dataclass(frozen=True)
class Settings:
    model_dir: Path = field(default_factory=lambda: Path(os.environ.get("MODEL_DIR", "models")))
    img_size: int = int(os.environ.get("IMG_SIZE", "224"))
    sample_rate: int = int(os.environ.get("SAMPLE_RATE", "16000"))
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")
    # decision thresholds for the binary classifiers
    binary_threshold: float = float(os.environ.get("BINARY_THRESHOLD", "0.5"))
    signal: SignalConstants = field(default_factory=SignalConstants)


settings = Settings()
