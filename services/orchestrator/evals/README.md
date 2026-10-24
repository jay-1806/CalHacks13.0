# Accuracy test set

Checks that the tutor picks the right subject and points at the right things,
using screenshots whose correct targets are known exactly.

```bash
pnpm --filter @screentutor/orchestrator eval              # all cases, subject auto-detected
pnpm --filter @screentutor/orchestrator eval -- chess     # only cases whose id contains "chess"
pnpm --filter @screentutor/orchestrator eval -- --subject=given   # tell Claude the subject
```

Each case is one real Claude call with the app's settings (root `.env`, same model
and prompts). Results print as a table and are saved to `evals/results/` (ignored by git).

## What is measured

| Metric | Meaning |
|---|---|
| subject accuracy | the answer's `subject` matches the case |
| target recall | share of targets that a `[POINT]` or a mark landed on |
| steps aligned | spoken and drawn steps have the same count (voice/drawing sync) |
| shortcut shown | for cases that expect one, a `[DRAW:key]` was drawn |
| guided correct | "how do I" tasks and chess play wait for the learner (`nextAction: wait`); explanations finish (`done`) |

Scoring lives in `score.ts` (unit-tested in `src/__tests__/eval-score.test.ts`).

## Cases

`fixtures/generate.py` draws every screenshot and writes `fixtures/cases.json`
with the target regions, so nothing is hand-labelled. To add a case, add a
function there, run `python generate.py`, and commit the PNG and `cases.json`.

| Case | Subject | Targets |
|---|---|---|
| math-triangle | math | right angle at A, the three sides |
| math-integral | math | limits 2 and 4, the shaded region |
| software-crop | software | the Crop tool (and a shortcut keycap) |
| software-new-layer | software | the New Layer button or the Layer menu |
| software-crop-guided-next | software | guided turn 2, after the learner chose the Crop tool: the crop box or its handles |
| chess-fork-white-bottom | chess | knight d5, fork square c7, the king or rook it attacks |
| chess-fork-black-bottom | chess | same position, board flipped |
| chess-guided-start | chess | "help me play this": guides Nc7+ and waits |
| chess-guided-next | chess | after Nc7+ Kd7: the knight on c7 and Nxa8 |
| chess-smothered-start | chess | demo line, Philidor's smothered mate: guides Nf7+ (knight g5, square f7) |
| chess-smothered-sacrifice | chess | after 1.Nf7+ Kg8 2.Nh6+ Kh8: the queen sacrifice Qg8+ (queen c4, square g8) |
| language-spanish | language | the word "cerrada" |
| language-japanese | language | the word 飲みます |

Latest (2026-10-24, claude-opus-5-5, subject auto-detected, detailed teaching,
guided lessons): 11/11 subjects, target recall 1.0, steps aligned 11/11,
guided/whole correct 11/11, median full answer 10.5 s (the voice starts after
the first step, ~3 s).

The smothered-mate cases were added afterwards for the chess demo (position
`4r2k/pp4pp/8/q5N1/2Q5/B7/PP3PPP/6K1 w`): both pass, asking for Nf7+ and Qg8+.
