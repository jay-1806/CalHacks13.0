# ScreenTutor AI - Implementation Plan

## 1. Product Goal
ScreenTutor AI is a cursor-native AI tutor that lives near the user’s cursor, activates with a hotkey or floating button, and captures the screen only after explicit user action. It understands the visible learning material to explain it briefly using Claude or mock-Claude, points/draws directly on the screen using a transparent SVG overlay, and teaches through hints, progressive explanation ladders, quizzes, and misconception detection rather than immediately providing the final solution. The assistant remembers weak concepts using Redis, executes web research via Browserbase, proposes safe GUI actions through Simular/SimuLang, routes to specialist agents inspired by Fetch AI/Agentverse, and instruments the AI pipeline and app telemetry using Arize and Sentry.

---

## 2. Sponsor Architecture
We strictly include and integrate only the following sponsor technologies:
- **Claude**: Anthropic Vision API for visual screen understanding and text replies.
- **Fetch AI / Agentverse**: Routing model matching specialist local or remote tutor agents.
- **Redis**: Persistent learner profiles, session logs, recent questions, and concept mappings.
- **Browserbase**: Headless browser automation for live concept scraping and simpler research web summaries.
- **Simular / Sai / SimuLang**: Safe desktop automation, calculating coordinates and proposing clicks/keys with approval cards.
- **Arize**: Tracing of LLM inputs, completions, tokens, and latency measurements.
- **Sentry**: Capturing main process, renderer, and orchestrator errors and performance spans.

### Explicitly Excluded Runtime Integrations:
- QNX
- Zoox
- Cognition / Devin
- Annapurna Labs / AWS
- Poke / Interaction Co

No code or active runtime integration will use or mention these excluded sponsors.

---

## 3. Target Repo Structure
We align with the existing monorepo structure, extending components to enforce clarity and sponsor segregation:

```
/apps/desktop
  ├── src/main
  │    ├── index.ts        # Electron main process, transparent shell management
  │    ├── screenshot.ts   # Screen capture via desktopCapturer
  │    ├── shortcuts.ts    # Global hotkey registration (Ctrl+Shift+E)
  │    └── privacy.ts      # Privacy filter & window title blocklist
  └── src/renderer
       ├── App.tsx         # Main entry, toggling collapsed/expanded state
       └── components
            ├── ChatPanel.tsx          # Chat interface, prompt inputs, text displays
            ├── AnnotationOverlay.tsx  # Transparent SVG canvas overlay drawing layer
            └── MemoryPanel.tsx        # Memory state visualization (concepts, history)

/services/orchestrator
  ├── src/providers
  │    ├── ai-provider.ts          # AI Interface
  │    ├── anthropic-provider.ts   # Claude Vision API implementation
  │    └── mock-provider.ts        # Mock-Claude matching core demo rules
  ├── src/integrations
  │    ├── browserbase.ts          # Headless research browser scraper
  │    ├── simular.ts              # Simular safe action integration
  │    ├── fetch-agentverse.ts     # Specialist agent router
  │    ├── arize.ts                # Arize telemetry tracing
  │    └── sentry.ts               # Sentry error capture
  ├── src/memory
  │    ├── redis-memory.ts         # Redis database storage
  │    └── in-memory.ts            # Local RAM memory fallback
  └── src/routes
       ├── tutor.ts                # Ask tutor routes
       ├── actions.ts              # Propose and approve actions
       └── memory.ts               # Learner profiles queries

/packages/shared
  └── src/schemas                  # Zod schema definitions
       ├── drawing.ts              # Shapes, badges, coordinates
       ├── tutor.ts                # Request & response types
       ├── action.ts               # Simular proposed action contracts
       └── memory.ts               # Profile and session history keys

/docs
  ├── current-state-audit.md       # Critique and code inspection
  ├── architecture.md              # System flow overview
  ├── privacy-and-safety.md        # Privacy rules
  ├── sponsor-integrations.md      # Integration manuals
  └── final-acceptance-report.md   # Final verification report
```

---

## 4. Milestones & Acceptance Criteria

### Milestone 1: Core Clicky-like Loop (Cursor Buddy)
- **Objective**: Establish cursor-anchored transparent Buddy that opens at the mouse location, captures the screen upon question trigger, and closes/collapses to a rounded floating button without visual glitch boxes.
- **Acceptance Criteria**:
  - `mainWindow` configured as `transparent: true`. No gray boxes exist behind the floating button.
  - Pressing `Ctrl+Shift+E` positions the window immediately next to the user's cursor.
  - Screenshot capture triggers on question submission or hotkey, generating a valid base64 image representation.

### Milestone 2: Pointing and Drawing Protocol
- **Objective**: Support drawing overlay coordinates, parse point indicators from speech, and animate Buddy flying to target location.
- **Acceptance Criteria**:
  - Speech engine reads text containing point tags (e.g. `<point x="0.35" y="0.42" />`).
  - Regex parser strips point tags from the UI response text block.
  - Buddy (Main Window) smoothly animates (flies) to the screen point coordinate using custom easing-out loops.
  - Overlays render `circle`, `arrow`, `highlight`, `text_label`, `step_badge`, `underline`, and `dim_background` accurately.

### Milestone 3: Claude / Mock-Claude Tutoring
- **Objective**: Implement native `fetch` requests inside `AnthropicProvider` calling the Claude messages Vision API, falling back to a structured Mock provider.
- **Acceptance Criteria**:
  - System prompt instructs Claude to output structured JSON matching Zod schemas.
  - Mock mode responds dynamically to algebra, derivative, and u-sub concepts, returning coordinate drawings and hints.

### Milestone 4: Learning Modes
- **Objective**: Expose tabs/modes: Explain, Hint, Quiz, Research, and Actions.
- **Acceptance Criteria**:
  - Hint mode returns a detailed `hintLadder` instead of revealing solutions.
  - Quiz mode generates practice questions and renders interactive show/hide answers.

### Milestone 5: Redis Memory
- **Objective**: Refactor database storage to isolate namespaces using `screentutor:` key prefixes.
- **Acceptance Criteria**:
  - All profile keys match `screentutor:profile:${userId}`.
  - Weak concepts are stored and ranked in Redis, logging fallback to InMemory when Redis is offline.

### Milestone 6: Browserbase Research
- **Objective**: Wire up Browserbase REST endpoints to fetch page content and summarize text when in Research mode.
- **Acceptance Criteria**:
  - Calling Research mode queries Browserbase when API keys are configured, returning web citations and summaries.

### Milestone 7: Simular Proposed Actions
- **Objective**: Add Simular Action UI card inside Chat Panel, showing proposed GUI steps, risk badges, and Approve/Reject buttons.
- **Acceptance Criteria**:
  - Action list displays with risk level warning colors.
  - Clicking "Approve" triggers `/api/actions/approve` and simulates/executes GUI action.

### Milestone 8: Fetch-style Specialist Agents
- **Objective**: Refactor agent-router to delegate logic to modular agent files (Math, Misconception, Quiz, Research).
- **Acceptance Criteria**:
  - System router delegates request inputs and base answers to independent class instances.

### Milestone 9: Arize and Sentry Observability
- **Objective**: Instrument HTTP trace logger to log LLM metrics to Arize, and error/performance reporting to Sentry.
- **Acceptance Criteria**:
  - Telemetry wrappers send reports if keys exist in `.env`, otherwise print clean logs to standard console out.

### Milestone 10: Demo Polish and Final Acceptance
- **Objective**: Add a bundled math test sample HTML page and perform a final acceptance walk-through.
- **Acceptance Criteria**:
  - Full demo loops runs without errors or visual quirks.
  - Create `/docs/final-acceptance-report.md`.

---

## 5. Risk List & Mitigations
- **Overlay stealing focus**: Configure overlay `hasShadow: false`, `skipTaskbar: true`, and call `overlayWindow.setIgnoreMouseEvents(true)` so mouse clicks fall straight through to user windows.
- **Bad coordinate mapping**: Normalize coordinates on a 0.0 to 1.0 system, mapped in React to `vw` / `vh` dimensions matching full overlay bounds.
- **Accidental screenshot storage**: Hardcode `SCREENSHOT_STORAGE=none` default behavior to clean images from memory immediately after API return.
- **Unsafe computer control**: Enforce `requiresApproval: true` on all Simular action schemas. Auto-execution is entirely disabled.

---

## 6. Development Commands
- **Install dependencies**: `pnpm install`
- **Run dev environment**: `pnpm dev`
- **Run tests**: `pnpm test`
- **Lint code**: `pnpm lint`
- **Typecheck code**: `pnpm typecheck`
- **Start Redis**: `docker compose up -d redis`
