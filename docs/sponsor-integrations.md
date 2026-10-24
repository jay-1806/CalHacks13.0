# Sponsor Integrations — ScreenTutor AI (Cal Hacks 13.0)

Every integration sits behind an interface with a local fallback, so the app runs with no keys and each sponsor lights up as soon as its env vars are set. The in-app **Sponsor Integration Registry** panel (`GET /api/sponsors/status`) shows each one as `real`, `mock`, `error` or `disabled`.

| Sponsor | Product | Used for | Code | Fallback |
|---|---|---|---|---|
| Anthropic | Claude Opus 5.5 | Reading the screenshot and teaching step by step with pointer/drawing tags | `providers/anthropic-provider.ts` | none (required) |
| Anthropic | Claude computer use (`computer_toolset_20260801`) | Co-drive: proposes the next click / type / key step | `integrations/claude-codrive.ts`, desktop `main/desktop-actions.ts` | mock proposals |
| Convex | Database + functions | Learner profiles, weak concepts, session history, response cache | `convex/*.ts`, `memory/convex-memory.ts` | in-process memory |
| Moss | Real-time semantic search | Reusing an answer for a reworded question about the same screen | `cache/moss-index.ts` | exact-match cache only |
| Apify | RAG Web Browser actor | Research mode: search + scrape + summarize | `integrations/apify.ts` | canned research result |
| Fetch.ai | uAgents + Agentverse | Study-planner agent: question routing and spaced-repetition plans | `services/fetch-agent/`, `agents/fetch-provider.ts` | local router and agents |
| Elastic | Observability (managed OTLP) | Per-step traces, latency and evaluation scores | `observability/observability-service.ts` | no-op |
| Cartesia | Sonic TTS + Ink STT | Streaming voice in and out | `integrations/cartesia.ts`, renderer `api/tts.ts`, `api/transcription.ts` | system voice, browser speech recognition |
| Sentry | Error tracking | Desktop and orchestrator crash reports | `observability/sentry.ts`, desktop `sentry.ts` | console only |

---

## Anthropic — Claude Opus 5.5

- **What happens:** the screenshot (JPEG, long edge ≤ 1920 px) and question go to `claude-opus-5-5` at `effort: low`. The reply is schema-enforced JSON (`output_config.format`), `spokenText` streams to the client as it is generated, and the system prompt is prompt-cached.
- **Env:** `ANTHROPIC_API_KEY`, optional `CLAUDE_MODEL`, `CLAUDE_EFFORT`.
- **Privacy:** sent only after an explicit capture; blocked on denylisted windows and in privacy mode; screenshots are never stored (only an MD5 hash).

## Anthropic — Claude computer use (Co-drive)

- **What happens:** in Co-drive mode the goal and screenshot go to Claude with the computer toolset (drag, mouse-down/up, hold-key, zoom disabled). Up to three `left_click` / `double_click` / `right_click` / `type` / `key` / `scroll` calls become approval cards with normalized coordinates. Planning runs in parallel with the tutor's answer.
- **Execution:** an approved card is handed to the Electron main process, which re-checks privacy mode and the window denylist, maps the point to the right display, and performs it with native input APIs (Win32 on Windows, CoreGraphics on macOS) (typing is pasted via the clipboard, then the clipboard is restored).
- **Env:** `CODRIVE_ENABLED` (default on), `ENABLE_SAFE_ACTIONS` (default **off** — cards are shown but nothing is performed).
- **Safety:** every action needs a click to approve; `checkActionSafety` blocks deletes, terminals, sending messages, purchases and credentials; actions are single-use.

## Convex — learner memory

- **What happens:** `convex/memory.ts` holds queries/mutations for profiles, weak concepts (one row per concept, updated atomically), session turns and cache entries; a cron purges expired cache rows every 15 minutes. The orchestrator calls them with `ConvexHttpClient` and caches profiles in-process between writes.
- **Env:** `CONVEX_URL`, `SCREENTUTOR_CONVEX_SECRET` (also set on the deployment with `npx convex env set`). Every function rejects calls without the secret.
- **Demo:** ask two questions, open the Memory panel, then the Convex dashboard's `weakConcepts` table.

## Moss — semantic cache

- **What happens:** each cached tutor answer is indexed in Moss by its question text with scope metadata (mode, screenshot hash, lesson, style, weak concepts). On an exact-key miss, a query restricted to the same scope with `minScore ≥ 0.9` can return the earlier answer. Queries run on the locally loaded index (no network round trip).
- **Env:** `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY`, optional `MOSS_MIN_SCORE`, `MOSS_INDEX_NAME`.
- **Privacy:** an answer is never reused for a different screenshot.

## Apify — web research

- **What happens:** Research mode queries the RAG Web Browser actor (`rag-web-browser.apify.actor/search`) for "<concept> explained <level> level", then summarizes the first prose paragraph of the top page and lists the other results as takeaways, with source URLs. Results are cached in Convex.
- **Env:** `APIFY_API_TOKEN`.

## Fetch.ai — study-planner agent

- **What happens:** `services/fetch-agent/agent.py` is a uAgent registered on Agentverse through a mailbox. The orchestrator calls its REST endpoints — `POST /route` on each turn (800 ms timeout) and `POST /learning-plan` for review requests, which ranks weak concepts by struggle, repetition and time since last practice.
- **Env:** `FETCH_AGENTVERSE_ENABLED`, `FETCH_AGENT_URL`, `FETCH_AGENT_SEED` (agent side).
- **Privacy:** receives question text, mode and weak-concept statistics only — never screenshots.

## Elastic — observability

- **What happens:** each request is a root span with one child span per pipeline step (privacy check, context fetch, model call, research, Co-drive, memory), with events and `eval.*` scores, exported over OTLP/HTTP protobuf. The provider is not registered globally, so it does not clash with Sentry's OpenTelemetry setup.
- **Env:** `ELASTIC_OTLP_ENDPOINT`, `ELASTIC_API_KEY` (sent as `Authorization: ApiKey …`).
- **Privacy:** all attributes pass through `RedactionService` before export.

## Cartesia — voice

- **What happens:** the orchestrator mints short-lived Cartesia access tokens (`/api/voice/session`); the desktop app streams microphone PCM to Ink STT while push-to-talk is held, and plays Sonic TTS audio chunks as they arrive.
- **Env:** `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`.

## Sentry — errors

- **What happens:** desktop main, renderer and orchestrator exceptions, redacted in `beforeSend`.
- **Env:** `SENTRY_ENABLED`, `SENTRY_DSN`.
