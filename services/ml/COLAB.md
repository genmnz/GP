# Training plan — congestion classifier on Google Colab

> **Accuracy not good enough?** See the upgraded
> [`notebooks/train_congestion_v2_colab.ipynb`](notebooks/train_congestion_v2_colab.ipynb)
> — it trains on **two datasets** with a proper two-phase recipe and adds a **YOLO
> vehicle-count** pivot, benchmarked head-to-head. Rationale + dataset survey in
> [`DATASETS.md`](DATASETS.md). The plan below documents the original single-source v1.

Concrete, copy-paste plan to train the core congestion model on the
[Norway traffic-camera dataset](https://huggingface.co/datasets/ilsilfverskiold/traffic-camera-norway-images)
(6,782 labelled images, 639 MB) using a **free Colab GPU**. Nothing touches your PC,
and **the dataset never goes into GitHub** — only the small trained `.pt` comes back.

> **Just want it to run?** Use the ready-made notebook
> [`notebooks/train_congestion_colab.ipynb`](notebooks/train_congestion_colab.ipynb).
> In Colab: *File → Upload notebook* and pick that file (or, once the repo is pushed,
> open `https://colab.research.google.com/github/genmnz/GP/blob/main/services/ml/notebooks/train_congestion_colab.ipynb`).
> Set *Runtime → GPU*, then *Runtime → Run all*. It is self-contained — the steps below
> are the same thing explained piece by piece.

## Why not "clone the dataset into GitHub"?

You shouldn't. GitHub caps files at 100 MB and isn't a dataset host; 639 MB of images
would bloat the repo forever. Instead **Colab pulls the dataset straight from Hugging
Face** (Colab has its own disk + fast internet), trains, and you ship back only the
weights (~6–85 MB depending on backbone) via a **GitHub Release**, not the repo tree.

## Scope (images only)

This dataset trains the **congestion** model only — it has no audio, no accident, and
no ambulance labels. So:

- **siren** (audio) stays inert: `/infer` with no audio returns `{detected:false}`;
  emergency falls back to vision. Nothing to train here.
- **accident / ambulance** need their own image datasets (separate, harder — treat as
  stretch). The pipeline already handles them as stubs until then.

## Label mapping (by name — the dataset's int ids are NOT ordinal)

| dataset class    | our class | weight |
|------------------|-----------|--------|
| `no-traffic`     | `empty`   | 1 |
| `low-traffic`    | `low`     | 2 |
| `medium-traffic` | `high`    | 3 |
| `high-traffic`   | `jam`     | 4 |

`scripts/prepare_hf_dataset.py` applies this and writes the ImageFolder layout.

## Model choice (researched)

For ~6k images, **CNN transfer learning beats Vision Transformers** (ViTs need 300M+
images). We default to **EfficientNetV2-S** (best accuracy, ~85 MB) and offer
**MobileNetV3-small** (~6 MB, committable) and a from-scratch small CNN.

---

## The cells

**0.** Runtime → Change runtime type → **GPU**.

**1. Clone + install.** Colab already has torch/torchvision (with CUDA) — install only
the package + `datasets`, do NOT pull the `[ml]` extra (it would reinstall torch and can
break CUDA):

```python
!git clone https://github.com/genmnz/GP.git
%cd GP/services/ml
!pip -q install -e . datasets
```

**2. Pull the dataset from HF and lay it out as an ImageFolder** (downloads to Colab,
not your PC):

```python
!python -m scripts.prepare_hf_dataset --out data/congestion
# -> data/congestion/{empty,low,high,jam}/*.jpg
```

**3. Train (EfficientNetV2-S transfer learning):**

```python
!python -m training.train_congestion --data data/congestion --arch efficientnet --epochs 12
# -> models/traffic.pt   (checkpoint stores arch + class order)
```

**4. Evaluate with the equation** — accuracy, mean weighted error, confusion matrix,
per-class precision/recall/F1 (uses the model you just trained):

```python
!python -m scripts.classify_dataset --data data/congestion --out output/eval
import json; print(json.dumps(json.load(open("output/eval/metrics.json")), indent=2))
```

**5. (optional) Export ONNX** for zero-Python inference (onnxruntime-node in Bun):

```python
!python -m scripts.export_onnx --weights models/traffic.pt --out models/traffic.onnx
```

**6. Download the weights:**

```python
from google.colab import files
files.download('models/traffic.pt')
```

---

## Back on your PC

1. Drop `traffic.pt` into `services/ml/models/` (gitignored). The service loads it
   automatically on the next `/infer` — no code change (the checkpoint carries its arch).
2. Restart the ML service; `/health` now shows `traffic: { loaded: true }`.
3. Open the dashboard → **Classifier** → drop a real intersection image → real verdict.

## Sharing the model (without putting it in the repo tree)

`models/` is gitignored on purpose. Distribute the weight as a **release asset**:

```bash
gh release create congestion-v1 services/ml/models/traffic.pt -t "Congestion model v1"
```

Teammates download it into their own `services/ml/models/`.

## Notes / honesty for the report

- The model learns whatever *this dataset's* labelers meant by each level — document
  the mapping above and report metrics against the provided `validation` split.
- `prepare_hf_dataset.py` merges train+val into one ImageFolder and the trainer
  re-splits 80/20; for a strict report, keep the official split and evaluate on it.
- MobileNetV3-small (`--arch mobilenet`) is the move if you'd rather commit the weight
  directly (~6 MB) and skip releases.
