"""ScreenTutor study-planner agent (Fetch.ai uAgents).

Registers on Agentverse through a mailbox, and exposes two REST endpoints the
ScreenTutor orchestrator calls:

  POST /route          {question, mode}            -> {selectedAgent, reason}
  POST /learning-plan  {weakConcepts: [...]}       -> {summary, spokenText, hints, concept, plan}

Run:  python agent.py   (see README.md for setup)
"""

from __future__ import annotations

import os

from uagents import Agent, Context, Model

from planner import WeakConcept, build_learning_plan, route

PORT = int(os.environ.get("FETCH_AGENT_PORT", "8001"))

agent = Agent(
    name="screentutor-study-planner",
    port=PORT,
    # A fixed seed keeps the same agent address across restarts.
    seed=os.environ.get("FETCH_AGENT_SEED", "screentutor-study-planner-dev-seed-change-me"),
    mailbox=True,
    publish_agent_details=True,
    readme_path=os.path.join(os.path.dirname(__file__), "README.md"),
    description="Routes ScreenTutor questions to specialist tutors and builds spaced-repetition study plans.",
)


class RouteRequest(Model):
    question: str
    mode: str


class RouteResponse(Model):
    selectedAgent: str
    reason: str


class WeakConceptModel(Model):
    concept: str
    confidence: float
    timesSeen: int
    lastSeenAt: str


class LearningPlanRequest(Model):
    weakConcepts: list[WeakConceptModel]


class PlanItem(Model):
    concept: str
    priority: float
    action: str


class LearningPlanResponse(Model):
    summary: str
    spokenText: str
    hints: list[str]
    concept: str
    plan: list[PlanItem]


@agent.on_event("startup")
async def announce(ctx: Context) -> None:
    ctx.logger.info(f"ScreenTutor study planner running at {agent.address} (REST on :{PORT})")


@agent.on_rest_post("/route", RouteRequest, RouteResponse)
async def handle_route(ctx: Context, req: RouteRequest) -> RouteResponse:
    decision = route(req.question, req.mode)
    return RouteResponse(selectedAgent=decision.selected_agent, reason=decision.reason)


@agent.on_rest_post("/learning-plan", LearningPlanRequest, LearningPlanResponse)
async def handle_learning_plan(ctx: Context, req: LearningPlanRequest) -> LearningPlanResponse:
    concepts = [
        WeakConcept(c.concept, c.confidence, c.timesSeen, c.lastSeenAt) for c in req.weakConcepts
    ]
    return LearningPlanResponse(**build_learning_plan(concepts))


if __name__ == "__main__":
    agent.run()
