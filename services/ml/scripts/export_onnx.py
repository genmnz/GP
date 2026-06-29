"""Export a trained checkpoint to ONNX.

Enables running inference without Python at runtime (e.g. onnxruntime-node inside
Bun). The checkpoint records its arch + classes, so we rebuild the exact network.

    python -m scripts.export_onnx --weights models/traffic.pt --out models/traffic.onnx
"""

from __future__ import annotations

import argparse

from app.config import settings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", default=str(settings.model_dir / "traffic.pt"))
    parser.add_argument("--out", default=str(settings.model_dir / "traffic.onnx"))
    parser.add_argument("--img-size", type=int, default=settings.img_size)
    args = parser.parse_args()

    import torch

    from app.models.cnn import build_model

    ckpt = torch.load(args.weights, map_location="cpu")
    arch = ckpt.get("arch", "efficientnet")
    classes = ckpt.get("classes", [])
    model = build_model(arch, len(classes))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    dummy = torch.randn(1, 3, args.img_size, args.img_size)
    torch.onnx.export(
        model,
        dummy,
        args.out,
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    print(f"exported {arch} ({classes}) -> {args.out}")


if __name__ == "__main__":
    main()
