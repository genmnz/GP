"""FastAPI inference service — the only Python that runs at request time.

Stateless: image/audio in, predictions out. Holds no business logic; every
decision happens in the Bun backend. Exposes:

  GET  /health   model load status
  POST /infer    multi-model inference (image + optional audio)
  POST /verdict  one image -> full verdict (inference + signal plan + vehicles)
  GET  /stream   Server-Sent Events: live verdict from a stream URL every N sec
  POST /plan     run the signal equation on approaches (parity/testing helper)
"""

from __future__ import annotations

import json
import os
import time

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.logging_setup import get_logger, log_event
from app.registry import models_status, run_inference
from app.schemas import ApproachIn, InferenceResponse, PlanResponse
from app.scoring import Approach, compute_signal_plan

log = get_logger("ml.server")
app = FastAPI(title="Smart Traffic ML", version="0.2.0")

# The live dashboard connects to /stream directly via EventSource (decode + model
# live next to each other, so frames never cross the network). Allow its origin.
_origins = os.environ.get("CORS_ORIGIN", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "models": models_status()}


@app.post("/infer", response_model=InferenceResponse)
async def infer(image: UploadFile = File(...), audio: UploadFile | None = File(None)):
    img = await image.read()
    aud = await audio.read() if audio is not None else None
    result = run_inference(img, aud)
    log_event(
        log,
        "infer_done",
        traffic=result["traffic"]["label"],
        accident=result["accident"]["detected"],
        emergency=result["ambulance"]["detected"] or result["siren"]["detected"],
    )
    return result


@app.post("/verdict")
async def verdict(image: UploadFile = File(...), vehicles: bool = True):
    """One image -> the full live-style verdict (inference + signal plan +
    optional YOLO vehicle count). Same shape each /stream event uses."""
    from app.streaming import build_verdict

    img = await image.read()
    return build_verdict(img, with_vehicles=vehicles, with_thumb=False)


@app.get("/stream")
def stream(url: str, interval: float = 3.0, vehicles: bool = True):
    """Live verdicts as Server-Sent Events. Plug in a YouTube/HLS/RTSP/file URL;
    the model re-verdicts one sampled frame every `interval` seconds.

    Each `data:` line is one verdict JSON (inference, plan, uncertainty,
    optional vehicle count, and a small thumbnail). A trailing `event: error`
    line carries any fatal stream error.
    """
    interval = max(0.5, min(interval, 30.0))

    def gen():
        from app.streaming import build_verdict, frame_iter

        log_event(log, "stream_start", url=url, interval=interval)
        try:
            for i, jpg in enumerate(frame_iter(url, interval)):
                v = build_verdict(jpg, with_vehicles=vehicles, with_thumb=True)
                v["frame"] = i
                v["ts"] = time.time()
                yield f"data: {json.dumps(v)}\n\n"
        except Exception as exc:  # noqa: BLE001 - surface to the client, then end
            log_event(log, "stream_error", url=url, error=str(exc))
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.post("/plan", response_model=PlanResponse)
def plan(approaches: list[ApproachIn]):
    aps = [Approach(id=a.id, label=a.label, emergency=a.emergency, accident=a.accident) for a in approaches]
    p = compute_signal_plan(aps)
    return {"cycle": p.cycle, "demand": p.demand, "phases": p.phases, "preempt": p.preempt}
