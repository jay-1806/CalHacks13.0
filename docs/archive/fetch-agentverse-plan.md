# Fetch AI / Agentverse Specialist Agents Plan

This document outlines the architecture, responsibilities, messaging formats, registration processes, and discovery mechanisms for publishing ScreenTutor's specialist tutor agents onto the Fetch AI / Agentverse network.

---

## 1. Specialist Tutor Agent Catalog

We have decomposed the monolithic ScreenTutor logic into five specialized agents:

| Agent Name | Primary Responsibility | Key Focus Areas | Local File |
| :--- | :--- | :--- | :--- |
| **MathTutorAgent** | Visual screen math solving & chat reasoning | Algebra, derivatives, integrals, chain rule, u-substitution | [math-tutor.ts](file:///c:/Users/User/Desktop/2nd_brain/services/orchestrator/src/agents/math-tutor.ts) |
| **MisconceptionDetectorAgent** | Spotting user calculation/concept errors | Misconception warnings, drawing target snaps, memory updates | [misconception-detector.ts](file:///c:/Users/User/Desktop/2nd_brain/services/orchestrator/src/agents/misconception-detector.ts) |
| **QuizGeneratorAgent** | Active learning evaluation | Conceptual pop-quizzes, hidden answers, concept tags | [quiz-generator.ts](file:///c:/Users/User/Desktop/2nd_brain/services/orchestrator/src/agents/quiz-generator.ts) |
| **ResourceFinderAgent** | Deep external knowledge retrieval | Browserbase crawling, analogized summaries, external references | [resource-finder.ts](file:///c:/Users/User/Desktop/2nd_brain/services/orchestrator/src/agents/resource-finder.ts) |
| **LearningPlanAgent** | Personalized curriculum and refresher plans | Memory querying, study plans, weak concept refreshers | [learning-plan.ts](file:///c:/Users/User/Desktop/2nd_brain/services/orchestrator/src/agents/learning-plan.ts) |

---

## 2. Input / Output Protocols

To transition from local function calls to async network messages (e.g. Agentverse mailboxes), all agents communicate using standardized JSON payloads.

### Routing Request
Sent to the Agentverse Router Agent.
```json
{
  "sender": "agentverse://your-desktop-client-address",
  "destination": "agentverse://tutor-router",
  "protocol": "tutor-routing-v1",
  "payload": {
    "task": "route",
    "input": {
      "question": "What mistake did I make in differentiating sin(2x)?",
      "mode": "explain",
      "timestamp": "2026-06-17T19:28:00.000Z"
    }
  }
}
```

### Routing Response
Returned by the Agentverse Router Agent.
```json
{
  "selectedAgent": "MisconceptionDetectorAgent",
  "reason": "Input contains error-identifying keywords ('mistake').",
  "provider": "Fetch AI Agentverse"
}
```

### Execution Request
Sent to a specific specialist agent mailbox.
```json
{
  "sender": "agentverse://your-desktop-client-address",
  "destination": "agentverse://misconceptiondetectoragent",
  "protocol": "tutor-execution-v1",
  "payload": {
    "task": "execute",
    "agentType": "MisconceptionDetectorAgent",
    "input": {
      "userId": "user_123",
      "sessionId": "session_abc",
      "question": "What mistake did I make in differentiating sin(2x)?",
      "mode": "explain",
      "timestamp": "2026-06-17T19:28:05.000Z"
    }
  }
}
```

### Execution Response
Returned by the specialist agent.
```json
{
  "agentType": "MisconceptionDetectorAgent",
  "response": {
    "summary": "You forgot to multiply by the derivative of the inner function (2).",
    "spokenText": "Remember to apply the chain rule. sin(2x) derives to 2cos(2x).",
    "drawings": [],
    "concept": "chain_rule",
    "confidence": 0.95,
    "provider": "Fetch AI Agentverse"
  }
}
```

---

## 3. Agentverse Registration and Discovery Plan

To publish these agents to Agentverse, we will follow the Fetch AI agent development framework (`uagents`):

### 1. Registration
Each agent runs as a containerized microservice or serverless cloud agent using `uagents`:
```python
from uagents import Agent, Context, Model

class TutorRequest(Model):
    question: str
    mode: str

agent = Agent(name="MathTutorAgent", seed="math_agent_seed_phrase")

@agent.on_message(model=TutorRequest)
async def handle_request(ctx: Context, sender: str, msg: TutorRequest):
    ctx.logger.info(f"Received math query: {msg.question}")
    # Run math LLM reasoning and reply to sender...
    await ctx.send(sender, TutorResponse(...))

if __name__ == "__main__":
    agent.run()
```
Upon startup, the agents register their unique **addresses** and **manifests** to the Fetch AI ledger (Almanac contract).

### 2. Discovery via ASI:One & Almanac
- **Almanac Contract**: Desktop clients can lookup an agent's network details by querying its registered protocols (e.g. `tutor-execution-v1`) on-chain.
- **ASI:One Search**: ASI:One acts as an intelligent agent search registry. By searching for tags like `#education`, `#math`, or `#tutor`, client instances can dynamically locate active agent addresses in the vicinity and route workloads to them.

---

## 4. Current Local Status

- **AgentRouter**: Fully implemented and routing queries dynamically.
- **Specialist Agent Executors**: Operational. Math, Quiz, and Resource (Browserbase) agents successfully resolve requests.
- **Local Fallback**: Supported. Active when Agentverse environment credentials are empty.
