"""Live-stream ingestion: pull a street-camera stream (YouTube / HLS / file /
webcam), sample one frame every N seconds, and turn each frame into a full
verdict (congestion + signal plan + optional vehicle count + thumbnail).

Heavy, optional deps (yt-dlp, OpenCV, ultralytics) are imported lazily so the
base FastAPI service still boots and serves /infer without them. Install the
streaming stack with:  pip install -e .[stream]
"""

from __future__ import annotations

import base64
import os
import time
from typing import Iterator, Optional

from app.config import TRAFFIC_LABELS, settings
from app.logging_setup import get_logger, log_event
from app.registry import run_inference
from app.scoring import Approach, compute_signal_plan

log = get_logger("ml.streaming")

# vehicle count -> congestion label thresholds (empty<=t0<low<=t1<high<=t2<jam).
# Calibrate these on your data (the v2 notebook does exactly this) and override
# via COUNT_THRESHOLDS="3,8,15". They give the live "count-based" cross-check.
_DEFAULT_THRESHOLDS = (3, 8, 15)
# COCO class ids for things that are vehicles: car, motorcycle, bus, truck.
_VEHICLE_COCO_IDS = {2, 3, 5, 7}

_yolo = None  # cached ultralytics model (loaded once, lazily)


# --------------------------------------------------------------------------- #
# stream resolution + frame sampling
# --------------------------------------------------------------------------- #
def resolve_stream_url(url: str) -> str:
    """Resolve a watch-page URL (YouTube, Twitch, ...) to a direct media URL that
    OpenCV/FFmpeg can open. Direct media URLs, files, and webcam indices pass
    through unchanged."""
    if url.isdigit():  # webcam index
        return url
    lowered = url.lower()
    if any(lowered.split("?")[0].endswith(e) for e in (".m3u8", ".mp4", ".mkv", ".webm", ".avi", ".mov")):
        return url
    if "googlevideo.com" in lowered or lowered.startswith("rtsp://") or lowered.startswith("rtmp://"):
        return url
    try:
        import yt_dlp
    except Exception:
        return url  # no yt-dlp -> let OpenCV try the raw URL
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        # a single muxed stream <=720p keeps decode cheap and latency low
        "format": "best[height<=720][protocol^=http]/best[height<=720]/best",
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if info.get("url"):
        return info["url"]
    for f in info.get("formats", []) or []:
        if f.get("url"):
            return f["url"]
    return url


def frame_iter(url: str, interval: float = 3.0, max_frames: Optional[int] = None) -> Iterator[bytes]:
    """Yield JPEG-encoded frames sampled ~every `interval` seconds from the stream.
    Reconnects once on transient read failures (live streams hiccup)."""
    import cv2

    src = resolve_stream_url(url)
    is_device = str(src).isdigit()

    def _open():
        cap = cv2.VideoCapture(int(src)) if is_device else cv2.VideoCapture(src, cv2.CAP_FFMPEG)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # keep us near the live edge
        except Exception:
            pass
        return cap

    cap = _open()
    if not cap.isOpened():
        raise RuntimeError(f"could not open stream (is it live / reachable?): {url}")

    log_event(log, "stream_open", url=url, resolved=str(src)[:80], interval=interval)
    count = 0
    last = 0.0
    reopened = False
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if reopened:
                    break  # give up after one reconnect
                cap.release()
                time.sleep(0.5)
                cap = _open()
                reopened = True
                continue
            reopened = False
            now = time.time()
            if now - last < interval:
                time.sleep(0.003)  # don't peg the CPU while draining buffered frames
                continue
            last = now
            ok2, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok2:
                continue
            yield buf.tobytes()
            count += 1
            if max_frames and count >= max_frames:
                break
    finally:
        cap.release()
        log_event(log, "stream_close", url=url, frames=count)


# --------------------------------------------------------------------------- #
# optional vehicle counting (the literal "detect cars" cross-check)
# --------------------------------------------------------------------------- #
def _count_thresholds() -> tuple[int, int, int]:
    raw = os.environ.get("COUNT_THRESHOLDS")
    if not raw:
        return _DEFAULT_THRESHOLDS
    try:
        a, b, c = (int(x) for x in raw.split(","))
        return a, b, c
    except Exception:
        return _DEFAULT_THRESHOLDS


def _count_to_label(n: int) -> str:
    t0, t1, t2 = _count_thresholds()
    if n <= t0:
        return "empty"
    if n <= t1:
        return "low"
    if n <= t2:
        return "high"
    return "jam"


def count_vehicles(jpg: bytes) -> Optional[dict]:
    """Detect + count vehicles in a frame with a COCO-pretrained YOLO. Returns
    None (gracefully) if ultralytics isn't installed."""
    global _yolo
    try:
        import numpy as np
        from ultralytics import YOLO
    except Exception:
        return None
    try:
        if _yolo is None:
            _yolo = YOLO(os.environ.get("YOLO_MODEL", "yolo11n.pt"))
        import cv2

        arr = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        res = _yolo.predict(arr, verbose=False, conf=0.25, imgsz=640)[0]
        ids = res.boxes.cls.int().tolist() if res.boxes is not None else []
        n = sum(1 for i in ids if i in _VEHICLE_COCO_IDS)
        return {"count": n, "label": _count_to_label(n)}
    except Exception as exc:  # noqa: BLE001 - never break the stream over this
        log_event(log, "vehicle_count_failed", error=str(exc))
        return None


# --------------------------------------------------------------------------- #
# per-frame verdict (mirrors the /api/classify response shape)
# --------------------------------------------------------------------------- #
def _thumb(jpg: bytes, width: int = 480) -> str:
    """Downscale to a small JPEG data-URI so the dashboard can show the frame."""
    try:
        import cv2
        import numpy as np

        arr = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        h, w = arr.shape[:2]
        if w > width:
            arr = cv2.resize(arr, (width, int(h * width / w)))
        ok, buf = cv2.imencode(".jpg", arr, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ok:
            jpg = buf.tobytes()
    except Exception:
        pass
    return "data:image/jpeg;base64," + base64.b64encode(jpg).decode("ascii")


def _entropy(probs: dict[str, float]) -> float:
    """Normalised Shannon entropy of the class distribution -> model uncertainty
    in [0,1]. 0 = fully confident, 1 = uniform guess. A nice 'scientific' panel."""
    import math

    vals = [p for p in probs.values() if p > 0]
    if not vals:
        return 0.0
    h = -sum(p * math.log(p) for p in vals)
    return h / math.log(len(TRAFFIC_LABELS))


def build_verdict(jpg: bytes, with_vehicles: bool = True, with_thumb: bool = True) -> dict:
    """Run the full pipeline on one frame: inference -> approach fusion -> signal
    plan, plus uncertainty and (optionally) a YOLO vehicle count + thumbnail."""
    inference = run_inference(jpg, None)
    approach = Approach(
        id="approach-1",
        label=inference["traffic"]["label"],
        emergency=inference["ambulance"]["detected"] or inference["siren"]["detected"],
        accident=inference["accident"]["detected"],
    )
    plan = compute_signal_plan([approach])
    verdict: dict = {
        "ok": True,
        "inference": inference,
        "approach": {
            "id": approach.id,
            "label": approach.label,
            "emergency": approach.emergency,
            "accident": approach.accident,
        },
        "plan": {"cycle": plan.cycle, "demand": plan.demand, "phases": plan.phases, "preempt": plan.preempt},
        "uncertainty": round(_entropy(inference["traffic"]["probs"]), 4),
    }
    if with_vehicles:
        v = count_vehicles(jpg)
        if v is not None:
            verdict["vehicles"] = v
    if with_thumb:
        verdict["thumb"] = _thumb(jpg)
    return verdict
