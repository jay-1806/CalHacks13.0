import { z } from 'zod';

// ---------------------------------------------------------------------------
// Safe Action Types
// ---------------------------------------------------------------------------

export const ActionType = z.enum(['click', 'type', 'hotkey', 'scroll', 'open_url', 'wait', 'none']);
export type ActionType = z.infer<typeof ActionType>;

export const RiskLevel = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const ActionStatus = z.enum(['proposed', 'approved', 'executed', 'cancelled', 'blocked', 'rejected', 'failed']);
export type ActionStatus = z.infer<typeof ActionStatus>;

// ---------------------------------------------------------------------------
// Proposed Action
// ---------------------------------------------------------------------------

export const ProposedAction = z.object({
  id: z.string(),
  type: ActionType,
  description: z.string(),
  /** Normalized 0–1 position on the captured screenshot (same space as [POINT] tags) */
  coordinates: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  /** Text to type, or the key combo for hotkey (e.g. "ctrl+s") */
  text: z.string().optional(),
  button: z.enum(['left', 'right']).optional(),
  clickCount: z.number().int().min(1).max(3).optional(),
  /** Modifier keys held during a click, e.g. "shift" */
  modifiers: z.string().optional(),
  scroll: z
    .object({
      direction: z.enum(['up', 'down', 'left', 'right']),
      amount: z.number().int().min(1).max(20),
    })
    .optional(),
  /** Which screen the coordinates refer to */
  screenNumber: z.number().optional(),
  riskLevel: RiskLevel,
  requiresApproval: z.literal(true),
  status: ActionStatus,
  reason: z.string().optional(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

// ---------------------------------------------------------------------------
// Action Approval Request
// ---------------------------------------------------------------------------

export const ActionApprovalRequest = z.object({
  actionId: z.string(),
  userId: z.string().optional(),
  approved: z.boolean(),
});
export type ActionApprovalRequest = z.infer<typeof ActionApprovalRequest>;

// ---------------------------------------------------------------------------
// Action Result
// ---------------------------------------------------------------------------

export const ActionResult = z.object({
  actionId: z.string(),
  success: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
  /** Present when the server approved an action for the desktop app to perform */
  action: ProposedAction.optional(),
});
export type ActionResult = z.infer<typeof ActionResult>;
