# ScreenTutor Study Planner (Fetch.ai agent)

A [uAgents](https://uagents.fetch.ai) agent that ScreenTutor's orchestrator calls to:

- **Route** a learner's question to the right specialist tutor (misconception, quiz, research, learning plan, or step explainer).
- **Plan study sessions**: rank the learner's weak concepts by how strongly they struggle, how often the concept came up, and how long since they last practiced it (spaced repetition), then return an ordered plan.

It never receives screenshots, only the question text, mode, and weak-concept statistics.

## REST endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/route` | `{ "question": "...", "mode": "explain" }` | `{ "selectedAgent", "reason" }` |
| POST | `/learning-plan` | `{ "weakConcepts": [{ "concept", "confidence", "timesSeen", "lastSeenAt" }] }` | `{ "summary", "spokenText", "hints", "concept", "plan" }` |

## Run

```bash
cd services/fetch-agent
python -m venv .venv                      # macOS: python3 -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python agent.py                   # macOS/Linux: .venv/bin/python agent.py
```

On first start the log prints the agent address and an Agent Inspector link. Open it and connect the mailbox to publish the agent on Agentverse. Set `FETCH_AGENT_SEED` to a private value so the address stays stable and can't be claimed by someone else.

Then in the repo's `.env`:

```env
FETCH_AGENTVERSE_ENABLED=true
FETCH_AGENT_URL=http://localhost:8001
```

If the agent is not running, the orchestrator falls back to its local router and agents.

## Test

```bash
.venv/Scripts/python -m unittest test_planner.py
```
