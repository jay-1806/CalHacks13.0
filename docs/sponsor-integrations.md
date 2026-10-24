# Sponsor Integrations — ScreenTutor AI (Cal Hacks 13.0)

ScreenTutor explains and solves math problems on screen. Six technologies power it.

Every integration sits behind an interface with a local fallback, so the app runs with no keys and each sponsor lights up as soon as its env vars are set. The in-app **Sponsor Integration Registry** panel (`GET /api/sponsors/status`) shows each one as `real`, `mock`, `error` or `disabled`.

| Sponsor | Product | Used for | Code | Fallback |
|---|---|---|---|---|
| Anthropic | Claude Opus 5.5 | Reading the screenshot and teaching step by step with pointer/drawing tags | `providers/anthropic-provider.ts` | none (required) |
| Convex | Database + functions | Learner profiles, weak concepts, session history, response cache | `convex/*.ts`, `memory/convex-memory.ts` | in-process memory |
| Moss | Real-time semantic search | Reusing an answer for a reworded question about the same screen | `cache/moss-index.ts` | exact-match cache only |
| Elastic | Observability (managed OTLP) | Per-step traces, latency and evaluation scores | `observability/observability-service.ts` | no-op |
| Cartesia | Sonic TTS + Ink STT | Streaming voice in and out | `integrations/cartesia.ts`, renderer `api/tts.ts`, `api/transcription.ts` | system voice, browser speech recognition |
| Sentry | Error tracking | Desktop and orchestrator crash reports | `observability/sentry.ts`, desktop `sentry.ts` | console only |

---

## Anthropic — Claude Opus 5.5

- **What happens:** the screenshot (JPEG, long edge ≤ 1920 px) and question go to `claude-opus-5-5` at `effort: low`. The reply is schema-enforced JSON (`output_config.format`), `spokenText` streams to the client as it is generated, and the system prompt is prompt-cached.
- **Env:** `ANTHROPIC_API_KEY`, optional `CLAUDE_MODEL`, `CLAUDE_EFFORT`.
- **Privacy:** sent only after an explicit capture; blocked on denylisted windows and in privacy mode; screenshots are never stored (only an MD5 hash).

## Convex — learner memory

- **What happens:** `convex/memory.ts` holds queries/mutations for profiles, weak concepts (one row per concept, updated atomically), session turns and cache entries; a cron purges expired cache rows every 15 minutes. The orchestrator calls them with `ConvexHttpClient` and caches profiles in-process between writes.
- **Env:** `CONVEX_URL`, `SCREENTUTOR_CONVEX_SECRET` (also set on the deployment with `npx convex env set`). Every function rejects calls without the secret.
- **Demo:** ask two questions, open the Memory panel, then the Convex dashboard's `weakConcepts` table.

## Moss — semantic cache

- **What happens:** each cached tutor answer is indexed in Moss by its question text with scope metadata (mode, screenshot hash, lesson, style, weak concepts). On an exact-key miss, a query restricted to the same scope with `minScore ≥ 0.9` can return the earlier answer. Queries run on the locally loaded index (no network round trip).
- **Env:** `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY`, optional `MOSS_MIN_SCORE`, `MOSS_INDEX_NAME`.
- **Privacy:** an answer is never reused for a different screenshot.

## Elastic — observability

- **What happens:** each request is a root span with one child span per pipeline step (privacy check, memory fetch, model call, delivery), with events and `eval.*` scores, exported over OTLP/HTTP protobuf. The provider is not registered globally, so it does not clash with Sentry's OpenTelemetry setup.
- **Env:** `ELASTIC_OTLP_ENDPOINT`, `ELASTIC_API_KEY` (sent as `Authorization: ApiKey …`).
- **Privacy:** all attributes pass through `RedactionService` before export.

## Cartesia — voice

- **What happens:** the orchestrator mints short-lived Cartesia access tokens (`/api/voice/session`); the desktop app streams microphone PCM to Ink STT while push-to-talk is held, and plays Sonic TTS audio chunks as they arrive.
- **Env:** `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`.

## Sentry — errors

- **What happens:** desktop main, renderer and orchestrator exceptions, redacted in `beforeSend`.
- **Env:** `SENTRY_ENABLED`, `SENTRY_DSN`.
