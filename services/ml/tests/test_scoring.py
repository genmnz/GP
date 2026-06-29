"""Tests for THE EQUATION — kept in sync with apps/server/tests/signal-engine.test.ts."""

from __future__ import annotations

from app.config import settings
from app.scoring import Approach, aggregate, compute_signal_plan, score_classification


def green_of(plan, approach_id: str) -> int:
    for ph in plan.phases:
        if ph["approachId"] == approach_id:
            return ph["green"]
    return -1


def test_empty_intersection():
    plan = compute_signal_plan([])
    assert plan.cycle == settings.signal.c_min
    assert plan.phases == []


def test_all_jam_maxes_cycle():
    plan = compute_signal_plan([Approach("n", "jam"), Approach("s", "jam")])
    assert abs(plan.demand - 1.0) < 1e-9
    assert plan.cycle == settings.signal.c_max


def test_busier_gets_more_green():
    plan = compute_signal_plan([Approach("n", "jam"), Approach("s", "low")])
    assert green_of(plan, "n") > green_of(plan, "s")


def test_min_green_respected():
    plan = compute_signal_plan(
        [Approach("n", "empty"), Approach("e", "empty"), Approach("s", "empty"), Approach("w", "jam")]
    )
    assert all(ph["green"] >= settings.signal.g_min for ph in plan.phases)


def test_emergency_preempts():
    plan = compute_signal_plan([Approach("n", "high"), Approach("s", "low", emergency=True)])
    assert plan.preempt == "s"
    assert green_of(plan, "s") == settings.signal.g_min * 3
    assert green_of(plan, "n") == 0


def test_score_classification_correct():
    sc = score_classification("high", 0.8, "high")
    assert sc.correct is True
    assert sc.weighted_error == 0.0
    assert abs(sc.score - 0.8) < 1e-9


def test_score_classification_ordinal_error():
    # predicted jam (W=4) when truth empty (W=1): error = 3/4
    sc = score_classification("jam", 1.0, "empty")
    assert sc.correct is False
    assert abs(sc.weighted_error - 0.75) < 1e-9
    assert abs(sc.score - 0.25) < 1e-9


def test_aggregate_per_class():
    rows = [
        (score_classification("empty", 0.9, "empty"), "empty", "empty"),
        (score_classification("low", 0.8, "empty"), "empty", "low"),
        (score_classification("jam", 0.7, "jam"), "jam", "jam"),
    ]
    m = aggregate(rows)
    assert m.total_images == 3
    assert m.correct == 2
    assert abs(m.accuracy - 2 / 3) < 1e-9
    assert m.per_class["jam"]["recall"] == 1.0
