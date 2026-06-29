"""Train the congestion 4-class classifier (the system's core model).

    # recommended: EfficientNetV2-S transfer learning (free Colab GPU, ~6k images)
    python -m training.train_congestion --data data/congestion --arch efficientnet --epochs 12

    # tiny committable model:
    python -m training.train_congestion --data data/congestion --arch mobilenet --epochs 15

    # from-scratch small CNN (no downloaded weights):
    python -m training.train_congestion --data data/congestion --arch small --epochs 25

Dataset is an ImageFolder with subdirs: empty/ low/ high/ jam/.
Use scripts/prepare_hf_dataset.py to build it from the Hugging Face dataset.
"""

from __future__ import annotations

import argparse

from app.config import TRAFFIC_LABELS, settings
from app.models.cnn import build_model, build_pretrained_classifier
from training.common import make_loaders, train


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="ImageFolder root (empty/low/high/jam)")
    parser.add_argument("--arch", default="efficientnet", choices=["efficientnet", "mobilenet", "small"])
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--out", default=str(settings.model_dir / "traffic.pt"))
    args = parser.parse_args()

    train_loader, val_loader, classes = make_loaders(args.data, batch_size=args.batch_size)
    if list(classes) != list(TRAFFIC_LABELS):
        print(f"warning: folder classes {classes} != expected {TRAFFIC_LABELS} (label order matters)")

    if args.arch == "small":
        model = build_model("small", len(classes))
    else:
        # fetch ImageNet weights for the backbone at train time
        model = build_pretrained_classifier(len(classes), arch=args.arch, pretrained=True)

    train(model, train_loader, val_loader, epochs=args.epochs, weights_out=args.out, arch=args.arch, classes=list(classes))
    print(f"saved congestion model ({args.arch}) -> {args.out}")


if __name__ == "__main__":
    main()
