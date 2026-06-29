from __future__ import annotations

from app.config import TRAFFIC_LABELS
from app.inference.base import Classifier

# Core 4-class congestion model. Train with the pretrained backbone for best
# results (checkpoint records its own arch, so loading just works).
traffic = Classifier(
    name="traffic",
    labels=list(TRAFFIC_LABELS),
    weights_name="traffic.pt",
    kind="image",
    default_arch="efficientnet",
)
