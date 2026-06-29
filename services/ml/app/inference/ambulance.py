from __future__ import annotations

from app.inference.base import Classifier

# Was YOLO; downgraded to a binary classifier — the orchestrator only needs yes/no.
ambulance = Classifier(
    name="ambulance",
    labels=["no", "yes"],
    weights_name="ambulance.pt",
    kind="image",
    default_arch="pretrained",
)
