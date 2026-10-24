import { describe, it, expect } from 'vitest';
import { MockCoDriveService, checkActionSafety } from '../integrations/codrive.js';
import type { ProposedAction } from '@screentutor/shared';

describe('Action Safety Helper', () => {
  it('blocks high-risk actions by default', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'click',
      description: 'Reset computer hardware',
      riskLevel: 'high',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('High-risk');
  });

  it('blocks file deletion actions', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'click',
      description: 'Delete user files',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('File deletion');
  });

  it('blocks terminal command execution', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'type',
      description: 'Open a terminal window and run script',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('Terminal execution');
  });

  it('blocks emails and messages', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'click',
      description: 'Send email invitation',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('emails or messages');
  });

  it('blocks purchases', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'click',
      description: 'Buy this item now',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('Purchases are blocked');
  });

  it('blocks credentials', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'type',
      description: 'Enter password',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('Password or credential');
  });

  it('blocks proposed actions when privacy mode is active', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'click',
      description: 'Click next button',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, true);
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('privacy mode');
  });

  it('blocks proposed actions on denylisted windows', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a1',
      type: 'click',
      description: 'Click next button',
      riskLevel: 'low',
      status: 'proposed'
    };
    const res = checkActionSafety(action, false, '1Password Extension');
    expect(res.status).toBe('blocked');
    expect(res.reason).toContain('denylisted windows');
  });

  it('blocks on stripe denylist term', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a2', type: 'click', description: 'Click pay', riskLevel: 'low', status: 'proposed'
    };
    expect(checkActionSafety(action, false, 'Stripe Dashboard').status).toBe('blocked');
  });

  it('blocks on checkout denylist term', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a3', type: 'click', description: 'Click buy', riskLevel: 'low', status: 'proposed'
    };
    expect(checkActionSafety(action, false, 'Checkout - Amazon').status).toBe('blocked');
  });

  it('blocks on wallet denylist term', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a4', type: 'click', description: 'View balance', riskLevel: 'low', status: 'proposed'
    };
    expect(checkActionSafety(action, false, 'Crypto Wallet').status).toBe('blocked');
  });

  it('blocks on authenticator denylist term', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a5', type: 'click', description: 'Click token', riskLevel: 'low', status: 'proposed'
    };
    expect(checkActionSafety(action, false, 'Google Authenticator').status).toBe('blocked');
  });

  it('blocks on incognito denylist term', () => {
    const action: Omit<ProposedAction, 'requiresApproval'> = {
      id: 'a6', type: 'click', description: 'Click item', riskLevel: 'low', status: 'proposed'
    };
    expect(checkActionSafety(action, false, 'Incognito Mode').status).toBe('blocked');
  });
});

describe('MockCoDriveService', () => {
  it('proposes blocked action for unsafe goals and blocks execution', async () => {
    const service = new MockCoDriveService();
    const actions = await service.proposeActions('Delete files');
    expect(actions[0].status).toBe('blocked');
    expect(actions[0].reason).toContain('File deletion');

    const result = await service.executeApprovedAction(actions[0].id);
    expect(result.success).toBe(false);
    expect(result.message).toContain('blocked');
  });

  it('proposes safe action for safe goal and allows execution', async () => {
    const service = new MockCoDriveService();
    const actions = await service.proposeActions('Click next button');
    expect(actions[0].status).toBe('proposed');

    const result = await service.executeApprovedAction(actions[0].id);
    expect(result.success).toBe(true);
  });
});
