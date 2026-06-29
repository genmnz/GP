"""Shared training utilities (PyTorch).

One reusable train loop over an ImageFolder dataset, used by every per-model
training script. torch/torchvision are imported lazily and only needed here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from app.config import settings
from app.logging_setup import get_logger, log_event

log = get_logger("ml.train")


def make_loaders(data_dir: str, batch_size: int = 32, val_split: float = 0.2):
    import torch
    from torch.utils.data import DataLoader, random_split
    from torchvision import datasets, transforms

    tf = transforms.Compose(
        [
            transforms.Resize((settings.img_size, settings.img_size)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(0.2, 0.2, 0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    ds = datasets.ImageFolder(data_dir, transform=tf)
    n_val = int(len(ds) * val_split)
    n_train = len(ds) - n_val
    train_ds, val_ds = random_split(ds, [n_train, n_val], generator=torch.Generator().manual_seed(42))
    return (
        DataLoader(train_ds, batch_size=batch_size, shuffle=True),
        DataLoader(val_ds, batch_size=batch_size),
        ds.classes,
    )


def train(
    model,
    train_loader,
    val_loader,
    epochs: int,
    weights_out: str,
    arch: str,
    classes: list[str],
    class_weights=None,
) -> None:
    import torch
    import torch.nn as nn

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device) if class_weights is not None else None)
    optim = torch.optim.Adam(model.parameters(), lr=1e-3)

    for epoch in range(1, epochs + 1):
        model.train()
        running = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optim.zero_grad()
            loss = criterion(model(x), y)
            loss.backward()
            optim.step()
            running += loss.item()

        acc = _evaluate(model, val_loader, device)
        log_event(log, "epoch", epoch=epoch, loss=round(running / max(len(train_loader), 1), 4), val_acc=round(acc, 4))

    Path(weights_out).parent.mkdir(parents=True, exist_ok=True)
    # Save arch + classes alongside the weights so inference rebuilds the exact net.
    torch.save({"state_dict": model.state_dict(), "arch": arch, "classes": classes}, weights_out)
    log_event(log, "saved", path=weights_out, arch=arch, classes=classes)


def _evaluate(model, loader, device) -> float:
    import torch

    model.eval()
    correct = total = 0
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            pred = model(x).argmax(1)
            correct += (pred == y).sum().item()
            total += y.numel()
    return correct / max(total, 1)
