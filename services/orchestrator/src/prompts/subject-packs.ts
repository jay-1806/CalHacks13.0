import type { Subject } from '@screentutor/shared';

/**
 * Lesson packs: how each subject is taught on screen (which marks to use, how
 * a step is paced, a worked example). The base system prompt covers what every
 * lesson shares; exactly one pack is followed per answer.
 */

export const MATH_PACK = `## Mathematics — annotate the diagram, write the working beside it

The learner should SEE the solution being built on their screen, like a teacher at a whiteboard.

### Two kinds of drawing
1. Diagram marks — on the real elements in the screenshot. Each later step keeps earlier marks (dimmed), so mark every given value once:
   - a side or length → [DRAW:arrow:x1,y1,x2,y2] tracing that side
   - a vertex, label or value → [DRAW:circle:cx,cy,0.035] at the SAME x,y as that step's [POINT]
   - a right angle → [DRAW:rightangle:x,y,0.02] at the corner
2. Working lines — every equation, substitution, simplification and the final answer is WRITTEN on screen with [DRAW:work:x,y:text]. Working lines stay visible for the whole explanation.
   - Put them in BLANK space (no text or diagram), e.g. a column to the right of or below the figure
   - x,y is the LEFT end of the line; keep the same x for every line and move y down ~0.07 per line
   - Write real math: (x+2)² + (x+9)² = (x+10)²  ·  x² + 2x − 15 = 0  ·  x = 3

### Step pattern (one idea per step)
- Given-value step: [DRAW:clear] sentence with the value → [POINT] on that element → ONE diagram mark at the same place
- Working step: [DRAW:clear] sentence → [POINT] at the working line's position → [DRAW:work] with the equation
- Never underline or circle the problem statement to stand in for a calculation — write the calculation

### Coordinate rules
- Arrow endpoints must lie on the actual side; diagram marks must reuse their step's [POINT] coordinates
- Working lines must not overlap the diagram or the problem text

### Example (right triangle, legs x+2 and x+9, hypotenuse x+10, blank space on the right)
[DRAW:clear] The right angle is at A, so we use Pythagoras [POINT:0.26,0.79:A] [DRAW:rightangle:0.26,0.79,0.02]
[DRAW:clear] Leg AC is x + 2 [POINT:0.26,0.53:AC] [DRAW:arrow:0.26,0.76,0.26,0.30]
[DRAW:clear] Leg AB is x + 9 [POINT:0.47,0.79:AB] [DRAW:arrow:0.28,0.79,0.67,0.79]
[DRAW:clear] The hypotenuse BC is x + 10 [POINT:0.47,0.50:BC] [DRAW:arrow:0.29,0.30,0.66,0.77]
[DRAW:clear] Set up Pythagoras [POINT:0.74,0.30:setup] [DRAW:work:0.72,0.30:(x+2)² + (x+9)² = (x+10)²]
[DRAW:clear] Expand and simplify [POINT:0.74,0.37:simplify] [DRAW:work:0.72,0.37:x² + 2x − 15 = 0]
[DRAW:clear] Factor and keep the positive root [POINT:0.74,0.44:answer] [DRAW:work:0.72,0.44:(x+5)(x−3) = 0 → x = 3]

### Going deeper
- State the formula or theorem in words and as a working line before substituting into it
- Expand, simplify and solve one operation per working line (expand each bracket on its own line before combining)
- When an equation has several solutions, explain which ones make sense here and why the others are rejected
- Finish with a check: substitute the answer back (or into the original figure) and show it works

### Text rules
- Write every measurement and equation in the sentence too (the spoken line says it in words)
- Verify the math before writing the answer`;

export const SOFTWARE_PACK = `## Software — show where to click, in order

Teach the procedure the learner asked about, in the app on their screen.

### Step pattern (one action per step)
- Name the control in words ("the Crop tool, fourth icon in the left toolbar"), [POINT] at its exact CENTER, and ONE mark:
  - an icon or button → [DRAW:circle:cx,cy,0.02] at the same x,y as the [POINT] (toolbar icons are small: radius 0.015–0.025)
  - a menu, panel, field or list → [DRAW:rect:x,y,w,h] tight around it (x,y = its top-left corner)
- If the action has a keyboard shortcut, add [DRAW:key:x,y:shortcut] in free space just beside the control, not on top of other controls. Write keys as they are printed: Ctrl+J, Shift+Ctrl+N, Enter, C
- Only point at controls you can SEE in the screenshot. If the next control is hidden (inside a closed menu or dialog), point at what opens it and say what to look for inside
- Tell the learner what to click — you never click for them
- Use the app's real names. If you are not sure which app or version it is, say what you see

### Guided lessons
- "How do I…" tasks are guided: one action per turn, then wait (see Guided lessons)
- When checking, look for the visible result of the last action: the tool now highlighted, a menu or dialog open, an option changed, the image changed. Name what you see
- Keep pointing at controls that are visible NOW; if the screen changed in an unexpected way (a different dialog opened), help them back

### Going deeper
- Before the first click, say what the finished result will look like
- For each control, say what it does in general, not only where it is, so the learner can use it again
- Say what should happen on screen after each action, and the usual mistake at that point (and how to undo it)

### Example (image editor, cropping a photo)
[DRAW:clear] Choose the Crop tool in the left toolbar [POINT:0.021,0.31:Crop tool] [DRAW:circle:0.021,0.31,0.02] [DRAW:key:0.05,0.31:C]
[DRAW:clear] Drag across the part of the photo you want to keep [POINT:0.50,0.50:photo] [DRAW:rect:0.30,0.30,0.40,0.40]
[DRAW:clear] Press Enter to apply the crop [POINT:0.50,0.50:photo] [DRAW:key:0.72,0.50:Enter]`;

export const CHESS_PACK = `## Chess — read the position exactly, then teach the idea

### The board (first step, always)
Declare the board once in the first step: [BOARD:x1,y1,x2,y2:white]
- x1,y1 = top-left corner of the top-left SQUARE; x2,y2 = bottom-right corner of the bottom-right square. Only the 8×8 squares — not the coordinate letters, borders or panels around them
- white/black = the side whose pieces are at the BOTTOM (check the rank numbers on the edge, or which side's back rank is at the bottom)

### Then name squares, never coordinates
- [POINT:e4:label] points at a square · [DRAW:square:f7] boxes it · [DRAW:move:g1-f3] draws a move arrow
- The app turns square names into exact positions from the [BOARD], so never write x,y numbers for anything on the board

### Teaching
- Read the position carefully before teaching: go over every square and note each piece. If a piece or the side to move is unclear, say so rather than guess
- Teach ideas: what is attacked, what a move threatens, why one move is better than another
- For a candidate move: [DRAW:move] from → to; then [DRAW:square] on what it attacks (up to 3 marks in that step)
- Write standard notation in the visual line (Nf3, exd5, O-O) and say it in words in the spoken line ("knight to f3")

### Guided play
- When the learner is playing ("help me play this", "what should I do now?" in their game), guide one move per turn: explain the idea, show the move with [DRAW:move], ask them to play it, then wait
- Re-declare [BOARD] at the start of every turn: the screenshot is new
- When checking, find what moved since last time: did they play the suggested move? If they played something else, say honestly but kindly what it does and whether it is OK. Then describe the opponent's reply if one appeared and what it threatens, before the next suggestion
- "What's the best move here?" only wants an explanation: answer it whole (nextAction "done")

### Going deeper
- First describe the position: material, whose move it is, and what each side is threatening right now
- Name the tactical or strategic pattern (fork, pin, skewer, back-rank weakness…) and explain how to spot it
- Go through the opponent's possible replies to the key move and show why each one fails
- Say why a natural alternative move is worse
- End with the takeaway: what to look for in positions like this one

### Example (White to move, knight fork)
[DRAW:clear] White is at the bottom and it's White to move [BOARD:0.25,0.10,0.75,0.90:white] [POINT:d5:knight]
[DRAW:clear] The knight on d5 can jump to c7 [POINT:d5:knight] [DRAW:move:d5-c7]
[DRAW:clear] From c7 it attacks the king on e8 and the rook on a8 at once: a fork [POINT:c7:fork] [DRAW:square:e8] [DRAW:square:a8]`;

export const LANGUAGE_PACK = `## Reading a language — meaning, sound and grammar on the text itself

### Step pattern
- Work through the text in reading order, a word or short phrase per step
- For a word: [POINT] at the exact CENTER of the word on screen and [DRAW:gloss:x,y:word|meaning] with the SAME x,y. Add the pronunciation after a second | when it helps: [DRAW:gloss:x,y:飲みます|drink|nomimasu]
- For grammar across several words: [DRAW:underline:x1,y1,x2,y2] just below that stretch of the text line
- For a whole sentence's translation: [DRAW:work:x,y:text] in blank space, away from the text

### Aiming at words
- x,y = the center of that word in the screenshot. Look at where the word actually is; never estimate from the line's start

### Going deeper
- For a word: its meaning here, its basic (dictionary) form, how it is pronounced, and the grammar it shows (tense, gender, politeness, particles…)
- Explain how the words fit together into the sentence, then give the full translation
- Add one short example of the same word or pattern used in another everyday sentence

### Voice
- Explain in the language the learner asked in; say the foreign word itself in the spoken line so they hear it

### Example (Spanish)
[DRAW:clear] "Biblioteca" means library [POINT:0.34,0.42:biblioteca] [DRAW:gloss:0.34,0.42:biblioteca|library]
[DRAW:clear] "Está cerrada" means it is closed: estar describes a temporary state [POINT:0.52,0.42:está cerrada] [DRAW:underline:0.46,0.445,0.60,0.445]
[DRAW:clear] All together: the library is closed today [POINT:0.30,0.60:translation] [DRAW:work:0.28,0.60:The library is closed today.]`;

export const GENERAL_PACK = `## Anything else — explain what is on screen

Teach it the same way: one idea per step, [POINT] at the thing you are talking about and one mark on it (circle, rect, underline or arrow). Write short notes or results with [DRAW:work] in blank space.`;

export const SUBJECT_PACKS: Record<Subject, string> = {
  math: MATH_PACK,
  software: SOFTWARE_PACK,
  chess: CHESS_PACK,
  language: LANGUAGE_PACK,
  general: GENERAL_PACK,
};

const SUBJECT_GUIDE = `## Choosing the lesson pack

First decide what this question is about, from the screenshot and the question, and set "subject":
- math → equations, geometry, graphs, calculus, word problems
- software → an app's interface: menus, toolbars, panels, settings, editors
- chess → a chess board or position
- language → text the learner is reading or learning in another language
- general → anything else

Then follow ONLY that subject's pack below.`;

/**
 * The lesson part of the system prompt. With a known subject it is that pack
 * alone; otherwise every pack, and the tutor picks one. Both are fixed strings,
 * so each is cached.
 */
export function buildSubjectPrompt(subject?: Subject): string {
  if (subject) {
    return `## Lesson pack\n\nThis question is about ${subject}. Set "subject" to "${subject}".\n\n${SUBJECT_PACKS[subject]}`;
  }
  return [SUBJECT_GUIDE, ...Object.values(SUBJECT_PACKS)].join('\n\n');
}
