"""Routing and study-plan logic for the ScreenTutor Fetch.ai agent.

Pure functions (no network) so they can be unit-tested and reused by the
REST handlers in agent.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

MISCONCEPTION_TERMS = ("mistake", "wrong", "error", "messed up", "where did i go wrong", "where did i mess up")
QUIZ_TERMS = ("quiz", "test me", "practice")
RESEARCH_TERMS = ("research", "simpler explanation", "find resource")
REVIEW_TERMS = ("review", "what should i study")


@dataclass
class RouteDecision:
    selected_agent: str
    reason: str


def route(question: str, mode: str) -> RouteDecision:
    """Pick the specialist for a question. Mirrors the orchestrator's local router."""
    q = question.lower()
    if any(term in q for term in MISCONCEPTION_TERMS):
        return RouteDecision("MisconceptionDetectorAgent", "Question asks about a mistake or error.")
    if mode == "quiz" or any(term in q for term in QUIZ_TERMS):
        return RouteDecision("QuizGeneratorAgent", "Quiz mode or the question asks to be tested.")
    if mode == "research" or any(term in q for term in RESEARCH_TERMS):
        return RouteDecision("ResourceFinderAgent", "Research mode or the question asks for outside resources.")
    if mode == "review" or any(term in q for term in REVIEW_TERMS):
        return RouteDecision("LearningPlanAgent", "Review mode or the question asks what to study.")
    return RouteDecision("MathTutorAgent", "Default: explain the step on screen.")


@dataclass
class WeakConcept:
    concept: str
    confidence: float  # 0–1: how sure we are the learner struggles with it
    times_seen: int
    last_seen_at: str  # ISO 8601


def _days_since(iso: str, now: datetime) -> float:
    try:
        seen = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    return max(0.0, (now - seen).total_seconds() / 86400)


def priority(concept: WeakConcept, now: datetime) -> float:
    """Higher = study sooner. Struggle strength, repetition, and time since last practice
    (a spaced-repetition nudge: concepts untouched for days come back up)."""
    recency_boost = min(_days_since(concept.last_seen_at, now), 14) / 14
    repetition = min(concept.times_seen, 5) / 5
    return round(0.6 * concept.confidence + 0.25 * repetition + 0.15 * recency_boost, 4)


def _label(concept: str) -> str:
    return concept.replace("_", " ")


def build_learning_plan(concepts: list[WeakConcept], now: datetime | None = None, limit: int = 3) -> dict:
    """Ordered study plan as a TutorResponse-shaped dict (summary, spokenText, hints, concept)."""
    now = now or datetime.now(timezone.utc)
    if not concepts:
        return {
            "summary": "No weak concepts identified yet! You are doing great.",
            "spokenText": "You have no weak concepts logged in your profile yet. Keep studying!",
            "hints": ["Keep up the good work! Try tackling more advanced problems."],
            "concept": "general",
            "plan": [],
        }

    ranked = sorted(concepts, key=lambda c: priority(c, now), reverse=True)[:limit]
    names = [_label(c.concept) for c in ranked]
    plan = [
        {
            "concept": c.concept,
            "priority": priority(c, now),
            "action": (
                "Re-learn from a worked example, then 3 practice problems"
                if c.confidence >= 0.7
                else "3 practice problems, check each step"
            ),
        }
        for c in ranked
    ]
    hints = ["Study in this order:"] + [
        f"{i + 1}. {_label(item['concept'])} — {item['action']}" for i, item in enumerate(plan)
    ]
    return {
        "summary": f"Your study plan, most urgent first: {', '.join(names)}.",
        "spokenText": f"Start with {names[0]}"
        + (f", then {', then '.join(names[1:])}" if len(names) > 1 else "")
        + ". Let's practice them together!",
        "hints": hints,
        "concept": ranked[0].concept,
        "plan": plan,
    }
