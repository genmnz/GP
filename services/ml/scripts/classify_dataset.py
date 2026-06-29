"""Batch-classify a labelled image dataset and run THE EQUATION over it.

This is the offline "feed 10K images" flow. The dataset is an ImageFolder:

    data/congestion/
      empty/ img001.jpg ...
      low/   ...
      high/  ...
      jam/   ...

For every image we:
  1. classify it (real model if weights exist, else deterministic stub),
  2. fuse the prediction with the folder's ground-truth label via the equation
     (correct / weighted_error / score),
  3. log a structured line, and
  4. write it to results.jsonl ; aggregate metrics go to metrics.json.

The Bun side then ingests those files into bun:sqlite
(`bun run src/scripts/ingest-classification.ts <run-dir>`).

Usage:
    python -m scripts.classify_dataset --data data/congestion --out output/run1
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from app.config import TRAFFIC_LABELS
from app.logging_setup import get_logger, log_event
from app.registry import classify_traffic
from app.scoring import aggregate, score_classification

log = get_logger("ml.classify")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def iter_images(root: Path):
    """Yield (path, true_label) for an ImageFolder layout. label = subdir name."""
    for label_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        label = label_dir.name
        true_label = label if label in TRAFFIC_LABELS else None
        for img in sorted(label_dir.rglob("*")):
            if img.suffix.lower() in IMAGE_EXTS:
                yield img, true_label


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="ImageFolder root")
    parser.add_argument("--out", required=True, help="output run directory")
    parser.add_argument("--model", default="congestion")
    parser.add_argument("--limit", type=int, default=0, help="cap images (0 = all)")
    args = parser.parse_args()

    data_root = Path(args.data)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / "results.jsonl"
    metrics_path = out_dir / "metrics.json"

    started = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    triples = []  # (ImageScore, true_label, pred_label) for aggregation
    model_version = "stub"
    n = 0

    with results_path.open("w", encoding="utf-8") as fh:
        for img_path, true_label in iter_images(data_root):
            if args.limit and n >= args.limit:
                break
            data = img_path.read_bytes()
            pred_label, confidence, probs = classify_traffic(data)
            sc = score_classification(pred_label, confidence, true_label)

            row = {
                "image_path": str(img_path),
                "true_label": true_label,
                "pred_label": pred_label,
                "confidence": confidence,
                "correct": sc.correct,
                "congestion_weight": sc.congestion_weight,
                "weighted_error": sc.weighted_error,
                "score": sc.score,
                "probs": probs,
            }
            fh.write(json.dumps(row) + "\n")
            log_event(
                log,
                "classified",
                image=img_path.name,
                true=true_label,
                pred=pred_label,
                conf=round(confidence, 4),
                err=round(sc.weighted_error, 4),
                score=round(sc.score, 4),
            )
            triples.append((sc, true_label, pred_label))
            n += 1

    metrics = aggregate(triples)
    finished = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    summary = {
        "dataset": str(data_root),
        "model": args.model,
        "model_version": model_version,
        "started_at": started,
        "finished_at": finished,
        **metrics.as_dict(),
    }
    metrics_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    log_event(
        log,
        "run_done",
        images=metrics.total_images,
        accuracy=round(metrics.accuracy, 4),
        mean_weighted_error=round(metrics.mean_weighted_error, 4),
        mean_score=round(metrics.mean_score, 4),
        out=str(out_dir),
    )
    print(
        f"classified {metrics.total_images} images | acc={metrics.accuracy:.4f} "
        f"mean_err={metrics.mean_weighted_error:.4f} mean_score={metrics.mean_score:.4f}\n"
        f"-> {results_path}\n-> {metrics_path}"
    )


if __name__ == "__main__":
    main()
