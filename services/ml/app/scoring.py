"""THE EQUATION.

This module is the mathematical heart of the system. It does two related things:

1. SIGNAL TIMING — turn congestion labels into a bounded, demand-proportional
   green split with emergency preemption. (Mirrors apps/server/.../signal-engine.ts.)

2. CLASSIFICATION SCORING — fuse the AI's output with the dataset's ground-truth
   label into per-image math, then aggregate it into run-level metrics. This is
   what gets logged for all 10K images and persisted for the report.

All functions are pure and dependency-free (stdlib only) so they are trivially
testable and identical in behaviour to the TS engine.

----------------------------------------------------------------------
Definitions
----------------------------------------------------------------------
  W(label)            ordinal weight, empty:1 low:2 high:3 jam:4 ; W_max = 4
  demand   D        = (Σ W(labelᵢ)) / (W_max · N)                  ∈ (0, 1]
  cycle    C        = clamp(round(C_min + (C_max − C_min)·D), C_min, C_max)
  budget   B        = max(C − LOST·N, G_min·N)
  green    gᵢ       = max(G_min, round((W(labelᵢ) / Σ W(labelⱼ)) · B))

  classification of one image (pred p, confidence c, ground truth t):
    correct          = 1 if p == t else 0
    weighted_error e = |W(p) − W(t)| / W_max                       ∈ [0, 1]   (ordinal)
    score          s = c · (1 − e)                                 ∈ [0, 1]

  run aggregate over results R:
    accuracy          = mean(correct)
    mean_weighted_err = mean(e)
    mean_score        = mean(s)
    confusion[t][p]   = count
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from app.config import WEIGHTS, W_MAX, settings


def weight(label: str) -> float:
    return WEIGHTS[label]


def _clamp(x: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, x))


# --------------------------------------------------------------------- #
# 1) Signal timing
# --------------------------------------------------------------------- #


@dataclass
class Approach:
    id: str
    label: str
    emergency: bool = False
    accident: bool = False


@dataclass
class SignalPlan:
    cycle: int
    demand: float
    phases: list[dict]  # {"approachId": str, "green": int}
    preempt: Optional[str] = None


def compute_signal_plan(approaches: list[Approach]) -> SignalPlan:
    s = settings.signal
    if not approaches:
        return SignalPlan(cycle=s.c_min, demand=0.0, phases=[])

    emergency = next((a for a in approaches if a.emergency), None)
    if emergency is not None:
        green = s.g_min * 3
        return SignalPlan(
            cycle=green,
            demand=1.0,
            preempt=emergency.id,
            phases=[
                {"approachId": a.id, "green": green if a.id == emergency.id else 0}
                for a in approaches
            ],
        )

    n = len(approaches)
    weights = [weight(a.label) for a in approaches]
    total_w = sum(weights) or 1.0

    demand = total_w / (W_MAX * n)
    cycle = int(_clamp(round(s.c_min + (s.c_max - s.c_min) * demand), s.c_min, s.c_max))
    budget = max(cycle - s.lost * n, s.g_min * n)

    return SignalPlan(
        cycle=cycle,
        demand=demand,
        phases=[
            {"approachId": a.id, "green": max(s.g_min, round((w / total_w) * budget))}
            for a, w in zip(approaches, weights)
        ],
    )


# --------------------------------------------------------------------- #
# 2) Classification scoring
# --------------------------------------------------------------------- #


@dataclass
class ImageScore:
    correct: bool
    congestion_weight: float
    weighted_error: float
    score: float


def score_classification(pred_label: str, confidence: float, true_label: Optional[str]) -> ImageScore:
    """Fuse one AI output with its ground-truth label into the per-image equation."""
    w_pred = weight(pred_label)
    if true_label is None:
        # unlabelled image — no error term available
        return ImageScore(correct=False, congestion_weight=w_pred, weighted_error=0.0, score=confidence)

    correct = pred_label == true_label
    weighted_error = abs(w_pred - weight(true_label)) / W_MAX
    score = confidence * (1.0 - weighted_error)
    return ImageScore(
        correct=correct,
        congestion_weight=w_pred,
        weighted_error=weighted_error,
        score=score,
    )


@dataclass
class RunMetrics:
    total_images: int
    correct: int
    accuracy: float
    mean_weighted_error: float
    mean_score: float
    confusion: dict[str, dict[str, int]]
    per_class: dict[str, dict[str, float]]

    def as_dict(self) -> dict:
        return {
            "total_images": self.total_images,
            "correct": self.correct,
            "accuracy": self.accuracy,
            "mean_weighted_error": self.mean_weighted_error,
            "mean_score": self.mean_score,
            "confusion": self.confusion,
            "per_class": self.per_class,
        }


def _per_class_metrics(confusion: dict[str, dict[str, int]]) -> dict[str, dict[str, float]]:
    """precision / recall / f1 per class from the confusion matrix."""
    labels = list(confusion.keys())
    out: dict[str, dict[str, float]] = {}
    for c in labels:
        tp = confusion[c][c]
        fn = sum(confusion[c][p] for p in labels) - tp  # true c, predicted other
        fp = sum(confusion[t][c] for t in labels) - tp  # predicted c, truly other
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        out[c] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": tp + fn,
        }
    return out


def aggregate(scores: Iterable[tuple[ImageScore, Optional[str], str]]) -> RunMetrics:
    """Aggregate (score, true_label, pred_label) triples into run-level metrics."""
    total = 0
    correct = 0
    sum_err = 0.0
    sum_score = 0.0
    labels = list(WEIGHTS.keys())
    confusion: dict[str, dict[str, int]] = {t: {p: 0 for p in labels} for t in labels}

    for sc, true_label, pred_label in scores:
        total += 1
        correct += 1 if sc.correct else 0
        sum_err += sc.weighted_error
        sum_score += sc.score
        if true_label in confusion and pred_label in confusion[true_label]:
            confusion[true_label][pred_label] += 1

    n = total or 1
    return RunMetrics(
        total_images=total,
        correct=correct,
        accuracy=correct / n,
        mean_weighted_error=sum_err / n,
        mean_score=sum_score / n,
        confusion=confusion,
        per_class=_per_class_metrics(confusion),
    )
