/**
 * Accuracy test set: asks Claude about each fixture screenshot, exactly as the app
 * does, and checks that it picked the right subject and pointed at the right places.
 *
 *   pnpm eval                       every case, subject auto-detected
 *   pnpm eval -- chess              only cases whose id contains "chess"
 *   pnpm eval -- --subject=given    tell Claude the subject instead of detecting it
 *
 * Each case is one real Claude call (cost and rate limits apply). Results are
 * printed and saved to evals/results/ (git-ignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TutorInput } from '@screentutor/shared';
import { config } from '../src/config.js';
import { ClaudeProvider } from '../src/providers/anthropic-provider.js';
import { buildSubjectPrompt } from '../src/prompts/subject-packs.js';
import { scoreAnswer, type CaseScore, type EvalCase } from './score.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const { width, height, cases } = JSON.parse(readFileSync(join(fixtures, 'cases.json'), 'utf8')) as {
  width: number;
  height: number;
  cases: EvalCase[];
};

const args = process.argv.slice(2);
const giveSubject = args.includes('--subject=given');
const filter = args.find((a) => !a.startsWith('--'));
const selected = cases.filter((c) => !filter || c.id.includes(filter));

if (!config.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set (root .env).');
  process.exit(1);
}
const provider = new ClaudeProvider(config.ANTHROPIC_API_KEY);

interface Row extends CaseScore {
  id: string;
  expected: string;
  got: string | undefined;
  latencyMs: number;
  overlayText?: string;
  spokenText?: string;
  awaiting?: string;
  error?: string;
}

const rows: Row[] = [];
for (const testCase of selected) {
  const png = readFileSync(join(fixtures, testCase.image)).toString('base64');
  const input = TutorInput.parse({
    userId: 'eval',
    sessionId: `eval-${testCase.id}-${Date.now()}`,
    question: testCase.question,
    subject: giveSubject ? testCase.subject : undefined,
    guide: testCase.guide,
    screenshotBase64: `data:image/png;base64,${png}`,
    screenMetadata: { imageWidth: width, imageHeight: height, width, height, coordinateSpace: 'normalized_image' },
  });
  const started = Date.now();
  process.stdout.write(`${testCase.id.padEnd(28)} … `);
  try {
    const answer = await provider.analyzeScreenAndQuestion(input, undefined, buildSubjectPrompt(input.subject));
    const score = scoreAnswer(testCase, answer);
    const row: Row = {
      id: testCase.id,
      expected: testCase.subject,
      got: answer.subject,
      latencyMs: Date.now() - started,
      overlayText: answer.overlayText,
      spokenText: answer.spokenText,
      awaiting: answer.awaiting,
      ...score,
    };
    rows.push(row);
    console.log(
      `${score.subjectCorrect ? 'subject ✓' : `subject ✗ (${answer.subject})`}  ` +
        `targets ${score.hit.length}/${testCase.targets.length}` +
        (score.missed.length ? ` (missed: ${score.missed.join(', ')})` : '') +
        (score.keyShown === false ? '  no shortcut shown' : '') +
        (score.nextCorrect === null ? '' : score.nextCorrect ? `  ${answer.nextAction} ✓` : `  ${answer.nextAction} ✗ (wanted ${testCase.expectNext})`) +
        (score.stepsAligned ? '' : '  steps misaligned') +
        `  ${((Date.now() - started) / 1000).toFixed(1)}s`
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(`error: ${error}`);
    rows.push({
      id: testCase.id,
      expected: testCase.subject,
      got: undefined,
      latencyMs: Date.now() - started,
      error,
      subjectCorrect: false,
      hit: [],
      missed: testCase.targets.map((t) => t.name),
      targetRecall: 0,
      stepsAligned: false,
      hasDrawings: false,
      keyShown: null,
      nextCorrect: null,
      aims: [],
    });
  }
}

const n = rows.length || 1;
const summary = {
  model: config.CLAUDE_MODEL,
  subjectMode: giveSubject ? 'given' : 'auto',
  cases: rows.length,
  subjectAccuracy: rows.filter((r) => r.subjectCorrect).length / n,
  targetRecall: rows.reduce((s, r) => s + r.targetRecall, 0) / n,
  stepsAligned: rows.filter((r) => r.stepsAligned).length / n,
  guidedCorrect: rows.filter((r) => r.nextCorrect !== false).length / n,
  medianLatencyMs: rows.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? 0,
};
console.log('\n' + JSON.stringify(summary, null, 2));

const resultsDir = join(here, 'results');
mkdirSync(resultsDir, { recursive: true });
const file = join(resultsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ summary, rows }, null, 2));
console.log(`Saved ${file}`);
