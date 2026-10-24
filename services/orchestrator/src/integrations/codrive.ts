import type { ProposedAction, ActionResult, ActionStatus } from '@screentutor/shared';
import { isWindowTitleDenied } from '@screentutor/shared';
import * as Sentry from '@sentry/node';

export interface ScreenCaptureResult {
  screenshotBase64: string;
  width: number;
  height: number;
}

export interface AccessibilityTreeResult {
  nodes: Array<{ id: string; role: string; name: string; bounds?: { x: number; y: number; w: number; h: number } }>;
}

export interface ElementLocationResult {
  found: boolean;
  x?: number;
  y?: number;
  confidence: number;
}

export interface ActionExecutionResult {
  actionId: string;
  success: boolean;
  message: string;
  timestamp: string;
  /** Returned when the action is approved for the desktop app to perform */
  action?: ProposedAction;
}

/** What the orchestrator knows about the screen a Co-drive goal refers to. */
export interface CoDriveScreenContext {
  privacyMode?: boolean;
  windowTitle?: string;
  screenshotBase64?: string;
  /** Pixel size of the screenshot sent to the model */
  imageWidth?: number;
  imageHeight?: number;
  screenNumber?: number;
}

export interface CoDriveIntegration {
  isConfigured(): boolean;
  captureScreen(context?: any): Promise<ScreenCaptureResult | null>;
  getAccessibilityTree(): Promise<AccessibilityTreeResult>;
  locateElement(query: string, screenContext?: any): Promise<ElementLocationResult>;
  proposeActions(goal: string, screenContext?: CoDriveScreenContext): Promise<ProposedAction[]>;
  executeApprovedAction(actionId: string): Promise<ActionExecutionResult>;
}

export function checkActionSafety(action: Omit<ProposedAction, 'requiresApproval'>, privacyMode: boolean, windowTitle?: string): { status: ActionStatus; reason?: string } {
  if (privacyMode) {
    return { status: 'blocked', reason: 'Proposed actions are blocked when privacy mode is active.' };
  }
  
  if (windowTitle) {
    if (isWindowTitleDenied(windowTitle)) {
      return { status: 'blocked', reason: 'Proposed actions are blocked on denylisted windows.' };
    }
  }

  const descLower = action.description.toLowerCase();
  const textLower = (action.text || '').toLowerCase();

  // File deletion
  if (descLower.includes('delete') || descLower.includes('remove') || descLower.includes('unlink') || descLower.includes('rm ') ||
      textLower.includes('delete') || textLower.includes('remove') || textLower.includes('rm ')) {
    return { status: 'blocked', reason: 'File deletion is blocked by safety rules.' };
  }

  // Terminal execution
  if (descLower.includes('terminal') || descLower.includes('shell') || descLower.includes('command') || descLower.includes('powershell') || descLower.includes('bash') ||
      textLower.includes('powershell') || textLower.includes('bash') || textLower.includes('cmd ')) {
    return { status: 'blocked', reason: 'Terminal execution is blocked by safety rules.' };
  }

  // Sending emails/messages
  if (descLower.includes('email') || descLower.includes('send') || descLower.includes('message') || descLower.includes('sms') || descLower.includes('chat') ||
      textLower.includes('email') || textLower.includes('send') || textLower.includes('message') || textLower.includes('sms')) {
    return { status: 'blocked', reason: 'Sending emails or messages is blocked.' };
  }

  // Purchases
  if (descLower.includes('buy') || descLower.includes('purchase') || descLower.includes('checkout') || descLower.includes('pay') || descLower.includes('order') ||
      textLower.includes('buy') || textLower.includes('purchase') || textLower.includes('pay')) {
    return { status: 'blocked', reason: 'Purchases are blocked.' };
  }

  // Credentials
  if (descLower.includes('password') || descLower.includes('credential') || descLower.includes('login') || descLower.includes('key') || descLower.includes('token') ||
      textLower.includes('password') || textLower.includes('credential') || textLower.includes('login')) {
    return { status: 'blocked', reason: 'Password or credential handling is blocked.' };
  }

  if (action.riskLevel === 'high') {
    return { status: 'blocked', reason: 'High-risk actions are blocked by default.' };
  }

  return { status: action.status };
}

export class MockCoDriveService implements CoDriveIntegration {
  private proposedActionsMap = new Map<string, ProposedAction>();

  isConfigured(): boolean {
    return false;
  }

  async captureScreen(context?: any): Promise<ScreenCaptureResult | null> {
    return {
      screenshotBase64: 'data:image/png;base64,mock...',
      width: 1920,
      height: 1080
    };
  }

  async getAccessibilityTree(): Promise<AccessibilityTreeResult> {
    return {
      nodes: [
        { id: 'n1', role: 'button', name: 'Next Problem', bounds: { x: 800, y: 900, w: 100, h: 40 } },
        { id: 'n2', role: 'text', name: 'Exercise 5: Calculate the derivative of y = x^2', bounds: { x: 100, y: 150, w: 400, h: 30 } },
        { id: 'n3', role: 'input', name: 'Answer Input', bounds: { x: 100, y: 200, w: 200, h: 30 } }
      ]
    };
  }

  async locateElement(query: string, screenContext?: any): Promise<ElementLocationResult> {
    const q = query.toLowerCase();
    if (q.includes('next problem') || q.includes('button')) {
      return { found: true, x: 850, y: 920, confidence: 0.95 };
    }
    return { found: false, confidence: 0.1 };
  }

  async proposeActions(goal: string, screenContext?: any): Promise<ProposedAction[]> {
    const g = goal.toLowerCase();
    let action: ProposedAction;

    if (g.includes('delete') || g.includes('remove')) {
      action = {
        id: 'action-delete',
        type: 'click',
        description: 'Delete project directories',
        riskLevel: 'high',
        requiresApproval: true,
        status: 'proposed'
      };
    } else if (g.includes('terminal') || g.includes('run')) {
      action = {
        id: 'action-terminal',
        type: 'type',
        description: 'Run custom shell command',
        text: 'rm -rf /',
        riskLevel: 'high',
        requiresApproval: true,
        status: 'proposed'
      };
    } else if (g.includes('email') || g.includes('message') || g.includes('send')) {
      action = {
        id: 'action-send',
        type: 'type',
        description: 'Send chat text message',
        text: 'Hello world',
        riskLevel: 'medium',
        requiresApproval: true,
        status: 'proposed'
      };
    } else if (g.includes('buy') || g.includes('purchase')) {
      action = {
        id: 'action-buy',
        type: 'click',
        description: 'Check out shopping cart items',
        riskLevel: 'medium',
        requiresApproval: true,
        status: 'proposed'
      };
    } else if (g.includes('password') || g.includes('credential')) {
      action = {
        id: 'action-cred',
        type: 'type',
        description: 'Input secret user API token',
        text: 'secret_key',
        riskLevel: 'medium',
        requiresApproval: true,
        status: 'proposed'
      };
    } else if (g.includes('high risk') || g.includes('risk')) {
      action = {
        id: 'action-high-risk',
        type: 'click',
        description: 'Execute high-risk hardware reset',
        riskLevel: 'high',
        requiresApproval: true,
        status: 'proposed'
      };
    } else {
      action = {
        id: 'action-safe-click',
        type: 'click',
        description: 'Click "Next Problem" button',
        coordinates: { x: 850, y: 920 },
        riskLevel: 'low',
        requiresApproval: true,
        status: 'proposed'
      };
    }

    const safety = checkActionSafety(action, screenContext?.privacyMode || false, screenContext?.windowTitle);
    action.status = safety.status;
    action.reason = safety.reason;

    this.proposedActionsMap.set(action.id, action);

    return [action];
  }

  async executeApprovedAction(actionId: string): Promise<ActionExecutionResult> {
    const action = this.proposedActionsMap.get(actionId);
    if (action && action.status === 'blocked') {
      return {
        actionId,
        success: false,
        message: `Action execution blocked: ${action.reason}`,
        timestamp: new Date().toISOString()
      };
    }

    if (actionId.includes('delete') || actionId.includes('terminal') || actionId.includes('send') || actionId.includes('buy') || actionId.includes('cred') || actionId.includes('risk')) {
      return {
        actionId,
        success: false,
        message: 'Action execution blocked: High-risk or blocked action.',
        timestamp: new Date().toISOString()
      };
    }

    return {
      actionId,
      success: true,
      message: 'Action executed successfully (Mocked - desktop control disabled).',
      timestamp: new Date().toISOString()
    };
  }
}
