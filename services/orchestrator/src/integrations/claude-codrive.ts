import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { ProposedAction } from '@screentutor/shared';
import { config } from '../config.js';
import { parseDataUrl } from '../providers/anthropic-provider.js';
import {
  checkActionSafety,
  type AccessibilityTreeResult,
  type ActionExecutionResult,
  type CoDriveIntegration,
  type CoDriveScreenContext,
  type ElementLocationResult,
  type ScreenCaptureResult,
} from './codrive.js';

const THINKING_UPDATES_BETA = 'thinking-display-updates-2026-08-18';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_PROPOSALS = 3;
const MAX_TURNS = 2;
const MAX_STORED_PROPOSALS = 100;

/**
 * Claude computer use (computer_toolset_20260801) as the Co-drive planner.
 * Only members that map to an approvable single step stay enabled.
 */
export const COMPUTER_TOOLSET = {
  type: 'computer_toolset_20260801',
  configs: {
    zoom: { enabled: false },
    left_click_drag: { enabled: false },
    left_mouse_down: { enabled: false },
    left_mouse_up: { enabled: false },
    middle_click: { enabled: false },
    mouse_move: { enabled: false },
    hold_key: { enabled: false },
    cursor_position: { enabled: false },
  },
};

const CODRIVE_SYSTEM_PROMPT = `You are ScreenTutor's Co-drive assistant. The learner wants help doing something on their computer.
Look at the screenshot and propose the NEXT step (at most ${MAX_PROPOSALS} actions) toward their goal using the computer tools.
Each action is shown to the learner as a card they must approve before anything happens, so propose, don't explore:
- Before each action, write one short sentence saying what it does and why.
- Never enter passwords, payment details or personal data; never send messages, buy, or delete anything.
- Do not run terminals or shell commands.
- If the goal is unclear or unsafe, take no action and explain in one sentence.`;

/** Minimal surface of the SDK used here (lets tests pass a fake). */
export interface CoDriveModelClient {
  beta: { messages: { create(params: any): Promise<any> } };
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
  toolset_name?: string;
}

export class ClaudeCoDriveService implements CoDriveIntegration {
  private client: CoDriveModelClient;
  private proposals = new Map<string, ProposedAction>();

  constructor(
    apiKey: string,
    private enableSafeActions: boolean,
    client?: CoDriveModelClient
  ) {
    this.client = client ?? (new Anthropic({ apiKey }) as unknown as CoDriveModelClient);
  }

  isConfigured(): boolean {
    return true;
  }

  async captureScreen(): Promise<ScreenCaptureResult | null> {
    return null; // the desktop app captures; the screenshot arrives with the question
  }

  async getAccessibilityTree(): Promise<AccessibilityTreeResult> {
    return { nodes: [] };
  }

  async locateElement(): Promise<ElementLocationResult> {
    return { found: false, confidence: 0 };
  }

  async proposeActions(goal: string, ctx: CoDriveScreenContext = {}): Promise<ProposedAction[]> {
    const image = parseDataUrl(ctx.screenshotBase64);
    if (!image || !ctx.imageWidth || !ctx.imageHeight) {
      return [this.store(blocked('Capture the screen first so Co-drive can see what to click.'))];
    }

    const imageBlock = { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } };
    const messages: any[] = [
      { role: 'user', content: [imageBlock, { type: 'text', text: `Goal: ${goal}` }] },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.beta.messages.create({
        model: config.CLAUDE_MODEL,
        max_tokens: 16000,
        system: CODRIVE_SYSTEM_PROMPT,
        thinking: { type: 'adaptive', display: 'updates' },
        output_config: { effort: config.CLAUDE_EFFORT },
        tools: [COMPUTER_TOOLSET],
        messages,
        betas: [THINKING_UPDATES_BETA, FALLBACK_BETA],
        fallbacks: 'default',
      });

      const proposals = this.toProposals(response.content ?? [], ctx);
      if (proposals.length > 0 || response.stop_reason !== 'tool_use') {
        if (proposals.length === 0) {
          const note = lastNote(response.content ?? []) || 'No safe next step found for that goal.';
          return [this.store(blocked(note))];
        }
        return proposals.map((p) => this.store(p));
      }

      // Only observation calls (e.g. screenshot): answer them and ask again once.
      const toolUses = (response.content as any[]).filter(isComputerToolUse);
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: toolUses.map((use) => ({
          type: 'tool_result',
          tool_use_id: use.id,
          toolset_name: 'computer',
          content: use.name === 'screenshot' ? [imageBlock] : [{ type: 'text', text: 'OK' }],
        })),
      });
    }
    return [this.store(blocked('Co-drive could not settle on a next step. Try a more specific goal.'))];
  }

  async executeApprovedAction(actionId: string): Promise<ActionExecutionResult> {
    const timestamp = new Date().toISOString();
    const action = this.proposals.get(actionId);
    if (!action) {
      return { actionId, success: false, message: 'Unknown or expired action.', timestamp };
    }
    if (action.status === 'blocked') {
      return { actionId, success: false, message: `Action execution blocked: ${action.reason}`, timestamp };
    }
    if (!this.enableSafeActions) {
      return {
        actionId,
        success: false,
        message: 'Desktop control is turned off (ENABLE_SAFE_ACTIONS=false). Do this step yourself.',
        timestamp,
      };
    }
    action.status = 'approved';
    this.proposals.delete(actionId);
    return { actionId, success: true, message: 'Approved — performing it on your desktop.', timestamp, action };
  }

  /** Map Claude's computer-tool calls to approval cards, in order. */
  toProposals(content: any[], ctx: CoDriveScreenContext): ProposedAction[] {
    const proposals: ProposedAction[] = [];
    let note = '';
    for (const block of content) {
      if ((block.type === 'thinking' && block.thinking) || (block.type === 'text' && block.text)) {
        note = (block.thinking || block.text).trim();
        continue;
      }
      if (!isComputerToolUse(block)) continue;
      const draft = toDraft(block, ctx);
      if (draft) {
        if (note) draft.description = note;
        const safety = checkActionSafety({ ...draft, status: 'proposed' }, !!ctx.privacyMode, ctx.windowTitle);
        proposals.push({ ...draft, requiresApproval: true, status: safety.status, reason: safety.reason });
        if (proposals.length >= MAX_PROPOSALS) break;
      }
      note = '';
    }
    return proposals;
  }

  private store(action: ProposedAction): ProposedAction {
    if (this.proposals.size >= MAX_STORED_PROPOSALS) {
      const oldest = this.proposals.keys().next().value;
      if (oldest) this.proposals.delete(oldest);
    }
    this.proposals.set(action.id, action);
    return action;
  }
}

function isComputerToolUse(block: any): block is ToolUseBlock {
  return block?.type === 'tool_use' && (block.toolset_name === 'computer' || !block.toolset_name);
}

function lastNote(content: any[]): string {
  const notes = content
    .filter((b) => (b.type === 'text' && b.text) || (b.type === 'thinking' && b.thinking))
    .map((b) => (b.text || b.thinking).trim());
  return notes[notes.length - 1] ?? '';
}

function blocked(reason: string): ProposedAction {
  return {
    id: randomUUID(),
    type: 'none',
    description: reason,
    riskLevel: 'low',
    requiresApproval: true,
    status: 'blocked',
    reason,
  };
}

function normalize(coord: unknown, ctx: CoDriveScreenContext): { x: number; y: number } | undefined {
  if (!Array.isArray(coord) || coord.length !== 2 || !ctx.imageWidth || !ctx.imageHeight) return undefined;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: clamp(Number(coord[0]) / ctx.imageWidth),
    y: clamp(Number(coord[1]) / ctx.imageHeight),
  };
}

type Draft = Omit<ProposedAction, 'requiresApproval' | 'status'>;

/** One computer-tool call -> one approvable action, or null for calls we don't perform. */
export function toDraft(use: ToolUseBlock, ctx: CoDriveScreenContext): Draft | null {
  const base = { id: randomUUID(), screenNumber: ctx.screenNumber };
  const input = use.input ?? {};
  switch (use.name) {
    case 'left_click':
    case 'right_click':
    case 'double_click':
    case 'triple_click': {
      const coordinates = normalize(input.coordinate, ctx);
      if (!coordinates) return null;
      const clickCount = use.name === 'double_click' ? 2 : use.name === 'triple_click' ? 3 : 1;
      const button = use.name === 'right_click' ? 'right' : 'left';
      return {
        ...base,
        type: 'click',
        coordinates,
        button,
        clickCount,
        modifiers: input.text || undefined,
        description: `${clickCount > 1 ? 'Double-click' : button === 'right' ? 'Right-click' : 'Click'} on the screen`,
        riskLevel: 'low',
      };
    }
    case 'type':
      return {
        ...base,
        type: 'type',
        text: String(input.text ?? ''),
        description: `Type "${String(input.text ?? '').slice(0, 60)}"`,
        riskLevel: 'medium',
      };
    case 'key':
      return {
        ...base,
        type: 'hotkey',
        text: String(input.text ?? ''),
        description: `Press ${input.text}`,
        riskLevel: 'medium',
      };
    case 'scroll': {
      const direction = input.scroll_direction;
      if (!['up', 'down', 'left', 'right'].includes(direction)) return null;
      return {
        ...base,
        type: 'scroll',
        coordinates: normalize(input.coordinate, ctx),
        scroll: { direction, amount: Math.min(20, Math.max(1, Number(input.scroll_amount) || 3)) },
        description: `Scroll ${direction}`,
        riskLevel: 'low',
      };
    }
    default:
      return null; // screenshot, wait, etc. are observations, not steps to approve
  }
}
