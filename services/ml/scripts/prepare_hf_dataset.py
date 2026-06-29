"""Pull the Norway traffic-camera dataset from Hugging Face and lay it out as an
ImageFolder our trainer understands.

Source: https://huggingface.co/datasets/ilsilfverskiold/traffic-camera-norway-images
  features: image (Image), label (ClassLabel: no-traffic/low-traffic/medium-traffic/high-traffic)
  splits:   train (6,103), validation (679)

The dataset's ClassLabel integer order is NON-ordinal, so we map by NAME into our
ordinal taxonomy (empty<low<high<jam):

    no-traffic     -> empty   (W=1)
    low-traffic    -> low     (W=2)
    medium-traffic -> high    (W=3)
    high-traffic   -> jam     (W=4)

This runs ON COLAB (or any machine with internet) — it never needs to touch your
PC, and the 639 MB of images never go into git. Only the trained .pt comes back.

Usage:
    pip install -e .[ml]          # brings in `datasets`
    python -m scripts.prepare_hf_dataset --out data/congestion
"""

from __future__ import annotations

import argparse
from pathlib import Path

REPO = "ilsilfverskiold/traffic-camera-norway-images"

# map by NAME (the dataset's int ids are not ordinal)
LABEL_MAP = {
    "no-traffic": "empty",
    "low-traffic": "low",
    "medium-traffic": "high",
    "high-traffic": "jam",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="data/congestion", help="ImageFolder output root")
    parser.add_argument("--repo", default=REPO)
    parser.add_argument("--limit", type=int, default=0, help="cap images per split (0 = all)")
    args = parser.parse_args()

    from datasets import load_dataset

    out = Path(args.out)
    for folder in LABEL_MAP.values():
        (out / folder).mkdir(parents=True, exist_ok=True)

    ds = load_dataset(args.repo)
    counts: dict[str, int] = {v: 0 for v in LABEL_MAP.values()}

    for split in ds:
        split_ds = ds[split]
        int2str = split_ds.features["label"].int2str
        for i, ex in enumerate(split_ds):
            if args.limit and i >= args.limit:
                break
            src_label = int2str(ex["label"])
            target = LABEL_MAP.get(src_label)
            if target is None:
                continue  # unknown label — skip rather than guess
            img = ex["image"].convert("RGB")
            path = out / target / f"{split}_{i:05d}.jpg"
            img.save(path, "JPEG", quality=90)
            counts[target] += 1

    total = sum(counts.values())
    print(f"wrote {total} images to {out}")
    for label, n in counts.items():
        print(f"  {label:6s} {n}")


if __name__ == "__main__":
    main()
