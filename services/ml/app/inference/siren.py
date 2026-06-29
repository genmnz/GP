from __future__ import annotations

from app.inference.base import Classifier

# Binary audio classifier over log-mel spectrograms (inert when no audio is sent).
siren = Classifier(
    name="siren",
    labels=["no", "yes"],
    weights_name="siren.pt",
    kind="audio",
    default_arch="audio",
)
