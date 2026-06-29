"""Pydantic schemas — the wire contract with the Bun backend.

Must match apps/server/src/types.ts (Inference).
"""

from __future__ import annotations

from pydantic import BaseModel


class TrafficOut(BaseModel):
    label: str
    confidence: float
    probs: dict[str, float]


class BinaryOut(BaseModel):
    detected: bool
    confidence: float


class InferenceResponse(BaseModel):
    traffic: TrafficOut
    accident: BinaryOut
    ambulance: BinaryOut  # vision
    siren: BinaryOut  # audio (edit i dont think we can do this from images our dataset is a bunch of images no audio, keep it otherwise)


class ApproachIn(BaseModel):
    id: str
    label: str
    emergency: bool = False
    accident: bool = False


class PlanResponse(BaseModel):
    cycle: int
    demand: float
    phases: list[dict]
    preempt: str | None = None
