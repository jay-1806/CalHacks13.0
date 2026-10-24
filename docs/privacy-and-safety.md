# Privacy & Safety — Quicky.AI

Quicky.AI is a privacy-first tutoring application. Privacy rules are not just a matter of policy; they are strictly enforced by software constraints at every layer.

---

## 1. Explicit Capture Only

**Rule:** Screen captures (screenshots) occur **only** when the user explicitly triggers analysis by pressing the keyboard hotkey `Ctrl+Shift+E` or clicking the floating UI action button.

- **No Background Recording**: The app never polls or records your screen silently.
- **No Periodic Polling**: There are no background intervals capturing screenshots.
- **No Passive Audio**: Microphone access is only triggered while holding down the push-to-talk key combination.

---

## 2. Privacy Mode

**Rule:** Privacy Mode is a global toggle. When activated, all sensitive capture flows are immediately disabled:

- **Screenshot Blocking**: Screen captures return empty dummy values.
- **Observability Gate**: Observability tracing spans omit window details.
- **Accessibility Tree Gate**: Spanning the accessibility context tree returns an empty object.
- **Memory Gating**: Profile and session writes are skipped.

---

## 3. Window Title Denylist

**Rule:** Screen analysis is blocked if the focused window title matches any of the canonical 16 denylist terms (case-insensitive substring match):

- `password`
- `1password`
- `keychain`
- `bank`
- `banking`
- `healthcare`
- `messages`
- `private`
- `incognito`
- `secret`
- `wallet`
- `authenticator`
- `email`
- `login`
- `stripe`
- `checkout`

**How it is enforced:**
1. The Electron main process checks the focused window title before capture. If it matches, capture is aborted, and a warning is sent to the UI.
2. The orchestrator backend runs `PrivacyGuard.assertAllowed(input)` to verify. If a title is blocked, it returns a generic privacy blocked response without calling the AI model.

---

## 4. Screenshot Policy

**Rule:** Screenshot raw data is treated as transient.
- **In-Memory Only**: Screenshots are processed in memory and never written to disk.
- **No Database Persistence**: Convex only stores the MD5 hash of screenshots (`screenshotHash`) within session turns. Raw base64 data is deleted immediately.
- **Telemetry Exclusion**: Traces sent to Elastic and error events sent to Sentry exclude screenshot payloads; every attribute passes through `RedactionService` first.

---

## 5. Memory Policy

**Rule:** The learner memory records only metadata to assist tutoring, and can be toggled or purged at any time.
- **Global Memory Toggle**: Users can turn off memory collection from the UI panel, which stops all writes to the backend.
- **Purge/Clear Command**: The "Clear Memory" button completely deletes the learner's profile, session turns, and concept history from Convex.
- **Filtered Content**: Memory logs store generalized question summaries rather than raw user inputs to prevent accidental leakage of typed secrets.

---

## 6. Action Safety & Approval Policy

**Rule:** Quicky.AI will never execute desktop actions automatically.
- **Explicit User Approval**: Every proposed click or keystroke appears as a card in the UI showing risk levels, descriptions, and coordinates. The user must click **Approve** to run it.
- **Global Safety Gate**: Any proposed actions containing file deletions (`rm`, `delete`), terminal executions (`bash`, `powershell`), transactions (`buy`, `checkout`), or communications (`send`, `email`) are blocked from appearing in the UI.

---

## 7. Observability Redaction Layer

**Rule:** Logging and telemetry must never leak private data.
- **Shared Redaction Service**: `RedactionService` scrubs API keys (`sk-...`), bearer tokens, passwords, credit card numbers, phone numbers, emails, and base64 strings from text and objects.
- **Query Parameter Strip**: URLs are stripped of all query parameter variables.
- **Console Log Patcher**: The global logger (`patchConsole`) automatically intercepts `console.log/warn/error` calls and redacts arguments prior to stdout print.
- **Developer Override**: Developers can toggle "Enable Dev Redaction Override" in the UI to inspect raw logs locally. This toggle propagates to backend memory writes.

---

## 8. API Key Handling

**Rule:** All API credentials live exclusively on the backend server environment.
- **No Client Exposure**: The desktop Electron client is never sent write-access API keys.
- **Config Validation**: Sponsors check key existence at boot time to report status without exposing keys in API requests.
