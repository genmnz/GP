from __future__ import annotations

from app.inference.base import Classifier

# Binary: index 1 ("yes") is the positive (accident) class.
accident = Classifier(
    name="accident",
    labels=["no", "yes"],
    weights_name="accident.pt",
    kind="image",
    default_arch="pretrained",
)
