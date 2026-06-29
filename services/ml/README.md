# Smart Traffic — ML service (Python, ML only)

Python touches **nothing but the models**: training scripts and a thin, stateless
inference service. Every decision (signal timing, alerts, persistence) happens in the
Bun backend. The database is **`bun:sqlite` on the TS side** — this service never talks
to a database.

## What's here

```
services/ml/
├─ app/
│  ├─ config.py          # labels, ordinal weights, signal constants (mirror the TS side)
│  ├─ scoring.py         # THE EQUATION: signal timing + classification scoring
│  ├─ logging_setup.py   # one JSON line per inference / equation eval
│  ├─ schemas.py         # pydantic wire contract (matches apps/server/src/types.ts)
│  ├─ preprocess.py      # image + (optional) audio preprocessing — lazy torch
│  ├─ models/cnn.py      # small CNN architectures
│  ├─ inference/         # one classifier per task, with stub fallback
│  ├─ registry.py        # runs the 4 classifiers, maps to the contract
│  ├─ streaming.py       # live stream -> frame sampling -> per-frame verdict (+ YOLO count)
│  └─ server.py          # FastAPI: /health /infer /verdict /stream /plan
├─ training/             # one train loop, reused per model
└─ scripts/classify_dataset.py   # batch-classify a labelled dataset + run the equation
```

## Two data flows

**Online (realtime):** `Bun -> POST /infer (image[, audio]) -> predictions`. The Bun
orchestrator fuses them into approaches, runs the signal engine, persists, broadcasts.

**Offline (the 10K dataset):** `classify_dataset.py` walks an ImageFolder, classifies
each image, fuses prediction + ground-truth label through **the equation**, logs every
line, and writes `results.jsonl` + `metrics.json`. Bun ingests them into `bun:sqlite`.

## The equation (see `app/scoring.py`)

```
W(label)            empty:1 low:2 high:3 jam:4 ;  W_max = 4
demand   D        = (Σ W(labelᵢ)) / (W_max · N)
cycle    C        = clamp(round(C_min + (C_max−C_min)·D), C_min, C_max)
green    gᵢ       = max(G_min, round((W(labelᵢ)/Σ W) · budget))   ; emergency preempts

per image (pred p, conf c, truth t):
  correct          = 1 if p == t else 0
  weighted_error e = |W(p) − W(t)| / W_max
  score          s = c · (1 − e)
run aggregate: accuracy, mean weighted error, mean score, confusion matrix
```

## Run it

```bash
cd services/ml
python -m venv .venv && . .venv/Scripts/activate   # Windows; use bin/activate on *nix

# Stub mode — no torch, returns deterministic predictions so the whole flow works:
pip install -e .
uvicorn app.server:app --reload --port 8000

# Real models:
pip install -e .[ml]
python -m training.train_congestion --data data/congestion --epochs 15
```

## Live street-camera streaming (the `/live` dashboard)

The live pipeline is **owned by the Bun server in TypeScript**, not Python — per the rule
that Python touches only the models. Bun resolves the stream (`yt-dlp`), decodes one frame
every N seconds (`ffmpeg`), calls this service's plain `POST /infer` per frame, runs the
signal engine, and pushes verdicts to the dashboard over **Server-Sent Events**
(`GET /api/stream` on the Bun server). So for basic live verdicts you need **no OpenCV, no
yt-dlp-python, no ultralytics here** — just the already-installed `[ml]` extra plus two
binaries on PATH for the Bun side:

```bash
# system binaries (Bun spawns these):  ffmpeg + yt-dlp
#   Windows:  winget install Gyan.FFmpeg yt-dlp.yt-dlp
#   macOS:    brew install ffmpeg yt-dlp
# then just run the model service normally:
pip install -e .[ml]
uvicorn app.server:app --port 8000
```

The web `/live` page connects to the **Bun** server (`VITE_SERVER_URL`), defaults to a
YouTube roads livestream, and re-verdicts every 3s. See `apps/server/src/ingest/stream.ts`.

### Optional: Python-side streaming + YOLO vehicle count
The service also keeps a self-contained Python stream (`GET /stream`) and a `POST /verdict`
that can add a **YOLO vehicle count** cross-check. That path needs the heavier extra:

```bash
pip install -e .[ml,stream]                 # adds yt-dlp + OpenCV + ultralytics
export CORS_ORIGIN=http://localhost:3001    # EventSource is cross-origin
export COUNT_THRESHOLDS=3,8,15              # vehicle-count -> label cutoffs (from the v2 notebook)
```

`COUNT_THRESHOLDS` is what the notebook's Track-B calibration prints; `YOLO_MODEL`
(default `yolo11n.pt`) picks the detector. Wire the web `/live` page to it by pointing
`openStream` at `VITE_ML_URL` instead of the server if you want the live vehicle count.

## Batch-classify a dataset and load it into the DB

```bash
# 1) classify (ImageFolder: data/congestion/{empty,low,high,jam}/*.jpg)
python -m scripts.classify_dataset --data data/congestion --out output/run1

# 2) ingest into bun:sqlite (from repo root)
bun run apps/server/src/scripts/ingest-classification.ts services/ml/output/run1
```

## Notes

- **No weights? Stub mode.** Missing/untrained models return reproducible pseudo
  predictions (seeded by an input hash) so the TS team can integrate before training
  finishes. Drop real `.pt` files into `MODEL_DIR` and they load automatically.
- **Image-only datasets.** `siren` is audio; with no audio input `/infer` simply returns
  `{detected:false}` for it and the emergency signal falls back to vision. The contract
  stays stable either way.
- Keep `app/config.py` and `app/scoring.py` in sync with `apps/server/src/types.ts` and
  `traffic/signal-engine.ts` — they are deliberately mirrored.
