"""Preprocessing for image and audio inputs.

Heavy deps (PIL/torch/librosa) are imported lazily so the service still boots
and serves stub predictions when they aren't installed (YAGNI for the TS team
integrating before the models exist).
"""

from __future__ import annotations

from app.config import settings


def load_image_tensor(data: bytes):
    """bytes -> normalized CHW float tensor of shape (1, 3, img, img). Lazy torch/PIL."""
    import io

    import torch
    from PIL import Image
    from torchvision import transforms

    img = Image.open(io.BytesIO(data)).convert("RGB")
    tf = transforms.Compose(
        [
            transforms.Resize((settings.img_size, settings.img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    return tf(img).unsqueeze(0)


def load_mel_tensor(data: bytes):
    """audio bytes -> log-mel spectrogram tensor (1, 1, n_mels, frames). Lazy torch/librosa."""
    import io

    import librosa
    import numpy as np
    import torch

    y, _ = librosa.load(io.BytesIO(data), sr=settings.sample_rate, mono=True)
    mel = librosa.feature.melspectrogram(y=y, sr=settings.sample_rate, n_mels=64)
    log_mel = librosa.power_to_db(mel, ref=np.max)
    t = torch.from_numpy(log_mel).float().unsqueeze(0).unsqueeze(0)
    return t
