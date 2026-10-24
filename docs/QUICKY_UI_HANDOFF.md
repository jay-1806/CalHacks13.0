# Quicky.AI UI Integration Handoff

**Audience:** teammates reviewing and merging `feature/quicke-ui-floating-launcher` into `main`.
**Product name:** Quicky.AI (branch spelling `quicke` is historical—do not rename).
**Do not merge this document alone;** merge the feature branch after review.

---

## 1. Executive Summary

This branch delivers the completed Quicky.AI desktop UI and launch-hardening work for Cal Hacks 13.0:

- Animated **Liquid Metal** floating launcher with free desktop drag
- **Four-action radial menu** (Voice / Capture / Text / Canvas)
- **Frosted Pearl** tutor panel (preferred **420 × 620**, **24px** radius)
- Compact **annotation overlay** refinements (separate window from chat)
- Product **rebrand** to Quicky.AI + official orbit logo / native icons
- First-launch **onboarding** (`quicky_onboarding_v1`)
- **Permission safety** (no mic prompt at startup; Voice-only mic ensure)
- Shared helpers for placement, pointers, brand, onboarding, permission policy
- README + this handoff for judges and teammates

**Not claimed:** live Claude → overlay → Cartesia E2E verification (needs root `.env` + deliberate ask). Packaged / notarized installer not verified.

Internal identifiers (`@screentutor/*`, `SCREENTUTOR_*`, `ai.screentutor.desktop`, many CSS/IPC names) are **intentionally preserved**.

---

## 2. Branch Information

| Item | Value |
|------|--------|
| Feature branch | `feature/quicke-ui-floating-launcher` |
| Base / merge target | `main` |
| Remote | `https://github.com/pgala3183/CalHacks13.0` |
| Compare URL | https://github.com/pgala3183/CalHacks13.0/compare/main...feature/quicke-ui-floating-launcher |
| Pre-handoff HEAD (matched `origin/main`) | `b74766d` |
| Feature commit (implementation) | `0684bfc` |
| Docs commit | `docs: add Quicky.AI README and UI integration handoff` |
| Intended remote tip after push | Local `HEAD` on this branch (confirm with `git ls-remote`) |

After push, confirm with `git rev-parse HEAD` and `git ls-remote --heads origin feature/quicke-ui-floating-launcher`.

**Divergence policy:** This handoff does **not** merge or rebase `origin/main` into the dirty feature work. If `main` advances, the merger resolves conflicts on their machine.

At handoff start the remote feature branch did **not** exist (`git ls-remote` empty); first push creates it.

---

## 3. UI Implementation Summary

### Phase 1 — Floating Liquid Metal launcher

- Component: `FloatingLauncher.tsx` + `FloatingLauncher.css` + `ui/LiquidMetalButton.*`
- Continuous shader-style metal animation; faster hover; rotating silver specular rim (`--st-rim-shine-duration: 11s`)
- Drag only while deliberately holding the pointer; free positioning (no forced edge dock)
- No oversized hover tooltips

### Phase 2 — Four-action radial menu

- `CircularCommandMenu.tsx` + `commandIcons.tsx`; geometry in `launcherGeometry.ts` / `menuLifecycle.ts`
- Default PLUS layout: **Voice** top, **Capture** left, **Text** right, **Canvas** bottom
- Expand/collapse; edge/corner-aware window sizing; frosted circular icon buttons (labels via aria, not permanent text chrome)
- Electron main syncs buddy window bounds when menu/panel opens

### Phase 3 — Frosted Pearl tutor panel

- `ChatPanel.tsx` / `ChatPanel.css`; tokens in `styles/tokens.css`
- Preferred size **420 × 620**; outer radius **`--st-radius-panel: 24px`**
- Smart placement via `packages/shared/src/panel-placement.ts` + main `placeTutorPanel` IPC
- Header drag moves the panel; launcher anchor preserved
- Chat history, composer, toolbar, voice indicators, `TutorStatusCards`, explanation handoff controls

### Phase 4 — Annotation refinement

- Teaching content lives primarily in the **separate annotation overlay** (`AnnotationOverlay.tsx`, `overlay-canvas.ts`), not only in chat bubbles
- Compact focus markers / arrows / trails; geometry helpers in `packages/shared/src/annotation-pointer.ts`
- **Not claimed:** mathematical glyph-level collision avoidance for every mark

### Phase 5 — Rebrand

- Display name `PRODUCT_DISPLAY_NAME = 'Quicky.AI'` (`packages/shared/src/brand.ts`)
- Master logo: repo root `Quicky Logo.png`
- Renderer: `apps/desktop/src/renderer/assets/quicky-logo.png`
- Packaging: `apps/desktop/build/icon.png`, `icon.icns`, `icon.ico`, `icon.iconset/`, `icon-1024*.png`
- Notes: `apps/desktop/build/BRANDING.md`; electron-builder product name updates

### Phase 6 — Onboarding

- `WelcomeOnboarding.tsx` + CSS; helpers `packages/shared/src/onboarding.ts`; renderer `onboardingStorage.ts`
- Copy: “Learn right on your screen.” / “Ask. Watch. Understand.” + three steps
- Actions: Get started / Not now; Help → Getting Started
- Persistence: `quicky_onboarding_v1` (+ session `quicky_onboarding_v1_session_auto`)
- Shown inside the existing buddy window (panel expanded to welcome)

### Phase 7 — Permission safety

- `permission-policy.ts` + main `permissions.ts` / startup path in `main/index.ts`
- No automatic microphone request at startup or onboarding
- Mic ensure only on deliberate Voice / hold-to-talk
- Screen capture remains user-initiated; denial does not permanently lock chat
- Onboarding reset removes **only** onboarding keys (`resetOnboardingKeysOnly`); mute (`screentutor_muted`) survives

### Phase 8 — Backend readiness (context)

- Orchestrator: Fastify `:4317`, `POST /api/tutor/ask` (SSE), `GET /health`
- Live Claude / Cartesia require root `.env`; not verified as full E2E in this handoff

---

## 4. Application Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron main (apps/desktop/src/main)                       │
│  buddy BrowserWindow · overlay window · capture · perms     │
└───────────────┬─────────────────────────────┬───────────────┘
                │ preload IPC                 │
┌───────────────▼─────────────┐  ┌────────────▼───────────────┐
│ Buddy renderer (React)      │  │ Overlay renderer           │
│ Launcher · radial · panel   │  │ AnnotationOverlay + canvas │
│ Onboarding · chat · voice UI│  │ Pointers / marks / bubbles │
└───────────────┬─────────────┘  └────────────────────────────┘
                │ HTTP / SSE
┌───────────────▼─────────────────────────────────────────────┐
│ Orchestrator (services/orchestrator) :4317                  │
│ Claude · memory · TTS session · sponsors status             │
└─────────────────────────────────────────────────────────────┘
```

**Audio narration:** renderer / main cooperate with orchestrator TTS session; Cartesia when configured, else system / timing fallbacks. Step sync uses shared narration helpers (`packages/shared` narration / step-audio queue).

---

## 5. Important Files

| Path | Responsibility |
|------|----------------|
| `apps/desktop/src/renderer/components/FloatingLauncher.tsx` | Launcher + menu wiring |
| `apps/desktop/src/renderer/components/ui/LiquidMetalButton.tsx` | Metal disc shader UI |
| `apps/desktop/src/renderer/components/ui/CircularCommandMenu.tsx` | Radial actions |
| `apps/desktop/src/renderer/components/ui/commandIcons.tsx` / `panelIcons.tsx` | Iconography |
| `apps/desktop/src/renderer/components/ChatPanel.tsx` | Tutor panel shell |
| `apps/desktop/src/renderer/components/WelcomeOnboarding.tsx` | First-run guide |
| `apps/desktop/src/renderer/components/TutorStatusCards.tsx` | Processing rows |
| `apps/desktop/src/renderer/components/AnnotationOverlay.tsx` | Overlay UI |
| `apps/desktop/src/renderer/components/overlay-canvas.ts` | Draw / pointer render |
| `apps/desktop/src/renderer/styles/tokens.css` | Frosted Pearl tokens |
| `apps/desktop/src/renderer/panelLayout.ts` | 420×620 / menu constants |
| `apps/desktop/src/renderer/launcherGeometry.ts` | Arc / PLUS window math |
| `apps/desktop/src/renderer/menuLifecycle.ts` | Expand/collapse lifecycle |
| `apps/desktop/src/renderer/onboardingStorage.ts` | localStorage bridge |
| `apps/desktop/src/main/index.ts` | Windows, IPC, placement, branding |
| `apps/desktop/src/main/permissions.ts` | Media access helpers |
| `apps/desktop/src/preload/index.ts` | Typed `electronAPI` |
| `packages/shared/src/brand.ts` | Display name / userData dir |
| `packages/shared/src/onboarding.ts` | Onboarding keys & gates |
| `packages/shared/src/permission-policy.ts` | When to prompt mic/screen |
| `packages/shared/src/panel-placement.ts` | Panel near launcher |
| `packages/shared/src/annotation-pointer.ts` | Pointer geometry |
| `packages/shared/src/tutor-panel-status.ts` | Status presentation |
| `packages/shared/src/tutoring-pipeline.ts` | Pure pipeline contracts |
| `Quicky Logo.png` | Official logo master |
| `apps/desktop/build/*` | Native icons (exclude `qa-*.png`) |
| `docs/QUICKY_UI_HANDOFF.md` | This document |
| `README.md` | Product + setup |

---

## 6. Design System

Verified from `tokens.css` and panel layout:

| Token / rule | Value |
|--------------|--------|
| Background | `#f7f8fa` |
| Surface / frost | `#ffffff` / `rgba(255,255,255,0.72)` |
| Graphite text | `#232d3d` / secondary `#687589` |
| Borders | `#dfe4eb` |
| Panel radius | **24px** (`--st-radius-panel`) |
| Panel size | **420 × 620** |
| Metal palette | `#f4f6f8` → `#8b93a3` |
| Motion | 120ms / 220ms, ease-out cubic-bezier(0.22, 1, 0.36, 1) |
| Focus | Neutral graphite rings (not purple launcher halo) |

Philosophy: light Frosted Pearl surfaces, minimal iconography, rounded geometry, **no purple-heavy panel chrome**. Accent `#7467e8` is semantic-only.

---

## 7. User Interactions

| Action | Behavior |
|--------|----------|
| Drag launcher | Hold pointer; free desktop move |
| Click launcher | Toggle radial menu |
| Voice | Top action; may ensure microphone |
| Capture | Left; starts region selection |
| Text | Right; expands Frosted Pearl panel + composer |
| Canvas | Bottom; canvas control sheet |
| Panel header drag | Repositions panel; launcher anchor kept |
| Collapse / restore | Returns toward launcher / collapsed buddy size |
| First run | Auto welcome when `quicky_onboarding_v1` is never |
| Help → Getting Started | Reopens welcome when tutoring is idle |
| Hold-to-talk | Existing hotkey path (`Cmd/Ctrl+Shift+E` family) |

---

## 8. State and Persistence

| Key / path | Scope |
|------------|--------|
| `quicky_onboarding_v1` | localStorage — completed / dismissed / never |
| `quicky_onboarding_v1_session_auto` | sessionStorage — HMR / remount gate |
| `screentutor_muted` | localStorage — mute (survives onboarding reset) |
| Electron `userData` | Folder segment `@screentutor/desktop` (unchanged) |
| Launcher position | Session / window geometry via main (not a public long-term preference API) |

Dev helper (localhost): `window.__quickyResetOnboarding()` clears **only** onboarding keys.

---

## 9. Security and Permissions

- Startup: status log only; **no** `askForMediaAccess` for mic
- Onboarding / Get started: **no** mic prompt
- Voice action: may call ensure-microphone IPC
- Capture / ask-with-screenshot: user-initiated; Screen Recording required on macOS (app may appear as **Electron** in TCC during `pnpm dev`)
- Do not recommend TCC database resets
- Root `.env` is gitignored; never commit secrets

---

## 10. Backend Dependencies

| Dependency | Role |
|------------|------|
| Orchestrator `:4317` | Tutor SSE, health, sponsors |
| `ANTHROPIC_API_KEY` | Required for live Claude explanations |
| Cartesia vars | Optional TTS/STT |
| Convex / Moss / Elastic | Optional with local fallbacks |

`.env` belongs at **repository root** (orchestrator loads `../../../.env`). Copy from `.env.example`.

Live Claude teaching still needs configuration + a **user-initiated** ask.

---

## 11. Test Coverage

Run from repo root:

```bash
npx pnpm@11.15.0 typecheck
npx pnpm@11.15.0 test
npx pnpm@11.15.0 build
git diff --check
```

New / extended suites include (among others):

- `brand.test.ts`, `onboarding.test.ts`, `launch-readiness.test.ts`
- `panel-placement.test.ts`, `radial-layout.test.ts`
- `annotation-pointer.test.ts`, `tutor-panel-status.test.ts`, `tutoring-pipeline.test.ts`

Report the **actual** Vitest totals from the latest run in the PR / final report (previous baseline was 268 across 35 files—verify after handoff commits).

---

## 12. Known Limitations

- No root `.env` / Anthropic key in the handoff environment → warm-up / live ask not verified
- Cartesia optional / often unset
- Screen Recording may be denied in some test environments
- Packaged macOS installer / notarization not verified
- Annotation layout is compact and geometry-aware, **not** guaranteed glyph-perfect collision avoidance
- Branch name and many internals still say `quicke` / `screentutor`

---

## 13. Merge Considerations

**Highest conflict risk vs `main`:**

- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/ChatPanel.tsx` (+ CSS)
- `packages/shared/src/index.ts`
- `services/orchestrator/src/prompts/tutor-system-prompt.ts`
- `README.md`, `package.json`, `pnpm-lock.yaml`

**Scope is not CSS-only:** Electron main/preload, shared packages, orchestrator prompts/tests, and permission behavior all change.

Preserve teammate backend work (Convex schema, privacy tests, capture fixes already on `main` baseline). Prefer resolving by keeping:

- UI / brand / onboarding / permission-policy from this branch
- Any newer orchestrator/AI pipeline commits from `main` if they advanced after `b74766d`

After resolving conflicts: `pnpm typecheck && pnpm test && pnpm build`.

**Intentionally excluded from commits:** `apps/desktop/build/qa-*.png` (visual QA rasters). See `BRANDING.md`.

---

## 14. Reviewer Checklist

- [ ] Compare URL opens; branch tip matches expected commit
- [ ] No secrets in diff (`.env`, keys, private screenshots)
- [ ] Official logo / icons present; `qa-*.png` not required in tree
- [ ] Product strings say **Quicky.AI**; internals may still say screentutor
- [ ] Startup does not prompt for microphone
- [ ] Onboarding appears once; Help → Getting Started works when idle
- [ ] Launcher drag + radial four actions work
- [ ] Panel ~420×620; overlay separate from chat
- [ ] `pnpm typecheck` / `test` / `build` pass
- [ ] Orchestrator health when started; live Claude only if key present

---

## 15. Post-Merge Verification

```bash
git checkout main
git pull
pnpm install
cp .env.example .env   # add ANTHROPIC_API_KEY for live demo
pnpm dev
curl http://localhost:4317/health
```

Manual: launcher → Text ask; optional Capture (after Screen Recording); Voice once; confirm overlay + narration path; follow-up question; mute survives onboarding reset helper.

---

## Suggested PR title

**feat: Quicky.AI desktop UI, branding, onboarding & launch hardening**

## Suggested compare / open PR

https://github.com/pgala3183/CalHacks13.0/compare/main...feature/quicke-ui-floating-launcher?expand=1
