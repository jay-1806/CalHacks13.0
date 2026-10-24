# 3-Minute Demo Script — ScreenTutor AI

A walkthrough of the live app for judges. Every step uses the real services, so set the keys in `.env` first (see the README).

---

## Setup (before you present)

1. Start Convex for learner memory: `cd services/orchestrator && npx convex dev` (Windows PowerShell: `npx.cmd convex dev`).
2. Optional: start the Fetch.ai study planner: `cd services/fetch-agent` and run `agent.py` from its virtualenv.
3. From the repo root: `pnpm dev` (Windows PowerShell: `pnpm.cmd dev`).
4. Open a math problem on screen, e.g. a right triangle with sides x + 2, x + 9 and hypotenuse x + 10.
5. Open the Sponsor Integration Registry panel and check that the sponsors you'll show read **real**.

---

## 0:00 — Hook (20s)
**Say**: *"ScreenTutor is an AI tutor that lives next to your cursor. It looks at what's on your screen only when you ask, explains it out loud, and works the problem on your screen like a teacher at a whiteboard."*

## 0:20 — Ask by voice, watch it teach (60s)
1. **Action**: Hold **Ctrl+Shift+E** (Mac: **Cmd+Shift+E**) and ask *"How do I solve this?"*, then let go.
2. **Say**: *"My voice streams to Cartesia's Ink speech-to-text while I hold the key, so the question is ready the moment I let go."*
3. **Point out** as it answers:
   - Claude Opus 5.5 reads the screenshot; the voice is Cartesia Sonic, streamed as it's generated.
   - Arrows and marks appear on the actual sides of the triangle, step by step.
   - Each line of working, from (x+2)² + (x+9)² = (x+10)² down to x = 3, is written in the blank space beside the diagram and stays there.

## 1:20 — Memory and a study plan (40s)
1. **Action**: Switch to **Hint** mode and ask for a hint on the next problem.
2. **Action**: Open the **Memory** panel.
3. **Say**: *"Every question updates my learner profile in Convex: weak concepts, how often they come up, and session history. Screenshots are never stored, only a hash."*
4. **Action**: Ask *"What should I study next?"*
5. **Say**: *"That request goes to our Fetch.ai study-planner agent on Agentverse, which ranks my weak concepts using spaced repetition."*

## 2:00 — Research (25s)
1. **Action**: Switch to **Research** and ask *"Find a simpler explanation of the Pythagorean theorem."*
2. **Say**: *"Research mode searches the live web through Apify's RAG Web Browser and summarizes the best page, with the source link. If I ask a reworded version of an earlier question about the same screen, Moss's semantic search returns the cached answer instantly."*

## 2:25 — Co-drive with approval (25s)
1. **Action**: Switch to **Co-drive** and ask *"Open the next problem."*
2. **Say**: *"Claude computer use proposes the exact click as a card. Nothing happens on my computer until I approve it, and privacy mode or a sensitive window blocks it entirely."*
3. **Action**: Approve the card (only if desktop control is turned on in `.env`).

## 2:50 — Close (10s)
**Say**: *"Every step is traced to Elastic with latencies and quality checks, and sensitive data is redacted before anything leaves the machine. ScreenTutor: a tutor that shows its work, right where you're working."*
