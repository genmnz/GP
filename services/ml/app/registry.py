"""Model registry — the single entry point the server calls.

Owns the four classifiers, runs them, maps their raw outputs into the wire
contract, and logs every prediction.
"""

from __future__ import annotations

from app.config import settings
from app.inference.accident import accident
from app.inference.ambulance import ambulance
from app.inference.siren import siren
from app.inference.traffic import traffic
from app.logging_setup import get_logger, log_event

log = get_logger("ml.registry")


def _binary(clf, data: bytes | None) -> dict:
    """Map a binary classifier's probs into {detected, confidence}.

    With no trained weights, the detector stays silent (not-detected) rather than
    emitting hash-seeded pseudo-predictions — congestion is the only trained model,
    so accident/ambulance/siren must not fabricate emergencies. Drop real .pt files
    in to enable them.
    """
    if data is None:
        return {"detected": False, "confidence": 0.0}
    clf._ensure_loaded()  # noqa: SLF001
    if clf._model is None:  # noqa: SLF001 - stub mode -> silent
        return {"detected": False, "confidence": 0.0}
    _label, _conf, probs = clf.predict(data)
    p_yes = probs.get("yes", 0.0)
    detected = p_yes >= settings.binary_threshold
    log_event(log, "infer", model=clf.name, version=clf.version, p_yes=round(p_yes, 4), detected=detected)
    return {"detected": detected, "confidence": p_yes}


def run_inference(image: bytes, audio: bytes | None) -> dict:
    label, conf, probs = traffic.predict(image)
    log_event(log, "infer", model="traffic", version=traffic.version, label=label, confidence=round(conf, 4))

    return {
        "traffic": {"label": label, "confidence": conf, "probs": probs},
        "accident": _binary(accident, image),
        "ambulance": _binary(ambulance, image),
        "siren": _binary(siren, audio),
    }


def classify_traffic(image: bytes) -> tuple[str, float, dict]:
    """Single-model path used by the batch dataset classifier."""
    return traffic.predict(image)


def models_status() -> dict:
    out = {}
    for clf in (traffic, accident, ambulance, siren):
        clf._ensure_loaded()  # noqa: SLF001 - intentional warm-up for /health
        out[clf.name] = {"loaded": clf._model is not None, "version": clf.version}  # noqa: SLF001
    return out
