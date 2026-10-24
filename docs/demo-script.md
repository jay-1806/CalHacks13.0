# 3-Minute Demo Script — ScreenTutor AI

A walkthrough of the live app for judges. Every step uses the real services, so set the keys in `.env` first (see the README).

---

## Setup (before you present)

1. Start Convex for learner memory: `cd services/orchestrator && npx convex dev` (Windows PowerShell: `npx.cmd convex dev`).
2. From the repo root: `pnpm dev` (Windows PowerShell: `pnpm.cmd dev`).
3. Open a math problem on screen, e.g. a right triangle with legs x + 2 and x + 9 and hypotenuse x + 10.
4. Open the Sponsor Integration Registry panel and check that the sponsors you'll show read **real**.

---

## 0:00 — Hook (20s)
**Say**: *"ScreenTutor is a math tutor that lives next to your cursor. It looks at your screen only when you ask, explains out loud, and works the problem on your screen like a teacher at a whiteboard."*

## 0:20 — Ask by voice, watch it teach (70s)
1. **Action**: Hold **Ctrl+Shift+E** (Mac: **Cmd+Shift+E**) and ask *"How do I solve this?"*, then let go.
2. **Say**: *"My voice streams to Cartesia's Ink speech-to-text while I hold the key, so the question is ready the moment I let go."*
3. **Point out** as it answers:
   - Claude Opus 5.5 reads the screenshot; the voice is Cartesia Sonic, streamed as it's generated.
   - Arrows and marks appear on the actual sides of the triangle, step by step, and earlier marks stay on screen.
   - Each line of working, from (x+2)² + (x+9)² = (x+10)² down to x = 3, is written in the blank space beside the diagram and stays there.

## 1:30 — Follow-up question (30s)
1. **Action**: Ask *"Why did we throw away x = −5?"*
2. **Say**: *"It remembers this session in Convex, so it answers in context: a side length can't be negative."*

## 2:00 — Memory (35s)
1. **Action**: Open the **Memory** panel.
2. **Say**: *"Every question updates my learner profile in Convex: the concepts I asked about, how often, and my recent questions. Screenshots are never stored, only a hash."*
3. **Say**: *"For a fresh question about a screen we've already explained, a reworded version is answered from cache through Moss's semantic search instead of calling Claude again."*

## 2:35 — Close (25s)
**Say**: *"Every step is traced to Elastic with latencies and quality checks, and sensitive windows like banking or email are blocked before anything is captured. ScreenTutor: a tutor that shows its work, right where you're working. Next, we're taking this beyond math to anything people learn online."*
