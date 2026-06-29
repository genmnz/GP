"""Classifier base with graceful stub fallback.

Behaviour-complete without trained weights: if torch or the weights file is
missing, the classifier returns *deterministic* pseudo-predictions derived from
a hash of the input. That lets the whole data flow (Bun -> ML -> engine -> DB)
run and be tested before any model is trained — swap real weights in later with
zero contract changes.

Checkpoints are saved as a dict {"state_dict", "arch", "classes"} so inference
rebuilds the exact architecture (small CNN vs pretrained backbone) before
loading weights. A bare state_dict is also accepted (falls back to default arch).
"""

from __future__ import annotations

import hashlib
import math

from app.config import settings
from app.logging_setup import get_logger, log_event
from app.models.cnn import build_model

log = get_logger("ml.inference")


class Classifier:
    def __init__(
        self,
        name: str,
        labels: list[str],
        weights_name: str,
        kind: str = "image",
        default_arch: str = "small",
    ) -> None:
        self.name = name
        self.labels = labels
        self.weights_name = weights_name
        self.kind = kind  # "image" | "audio" — drives preprocessing
        self.default_arch = default_arch
        self.arch = default_arch
        self._model = None
        self._loaded = False
        self.version = "stub"

    # ------------------------------------------------------------------ #
    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        weights = settings.model_dir / self.weights_name
        if not weights.exists():
            log_event(log, "weights_missing", model=self.name, path=str(weights), mode="stub")
            return
        try:
            import torch

            ckpt = torch.load(weights, map_location="cpu")
            if isinstance(ckpt, dict) and "state_dict" in ckpt:
                self.arch = ckpt.get("arch", self.default_arch)
                self.labels = ckpt.get("classes", self.labels)
                state = ckpt["state_dict"]
            else:
                self.arch = self.default_arch
                state = ckpt

            model = build_model(self.arch, len(self.labels))
            model.load_state_dict(state)
            model.eval()
            self._model = model
            self.version = weights.stem
            log_event(log, "weights_loaded", model=self.name, arch=self.arch, path=str(weights))
        except Exception as exc:  # noqa: BLE001 - degrade to stub, never crash the service
            log_event(log, "weights_load_failed", model=self.name, error=str(exc), mode="stub")
            self._model = None

    # ------------------------------------------------------------------ #
    def predict(self, data: bytes | None) -> tuple[str, float, dict[str, float]]:
        if data is None:
            probs = {self.labels[0]: 1.0, **{l: 0.0 for l in self.labels[1:]}}
            return self.labels[0], 1.0, probs
        self._ensure_loaded()
        probs = self._infer_real(data) if self._model is not None else self._infer_stub(data)
        label = max(probs, key=probs.get)
        return label, probs[label], probs

    # ------------------------------------------------------------------ #
    def _infer_real(self, data: bytes) -> dict[str, float]:
        import torch

        from app import preprocess

        tensor = (
            preprocess.load_image_tensor(data)
            if self.kind == "image"
            else preprocess.load_mel_tensor(data)
        )
        with torch.no_grad():
            logits = self._model(tensor)
            probs = torch.softmax(logits, dim=1).squeeze(0).tolist()
        return {label: float(p) for label, p in zip(self.labels, probs)}

    def _infer_stub(self, data: bytes) -> dict[str, float]:
        """Deterministic softmax seeded by the input hash — reproducible demos."""
        digest = hashlib.sha256(data + self.name.encode()).digest()
        raw = [digest[i] / 255.0 * 3.0 for i in range(len(self.labels))]
        exps = [math.exp(x) for x in raw]
        total = sum(exps)
        return {label: exps[i] / total for i, label in enumerate(self.labels)}
