import { describe, it, expect, beforeEach } from 'vitest';
import { RedactionService } from '@screentutor/shared';

describe('RedactionService', () => {
  beforeEach(() => {
    // Reset dev override to default false before each test
    RedactionService.setDevOverride(false);
  });

  describe('redactText', () => {
    it('redacts API keys', () => {
      const input = 'My key is sk-ant-12345678901234567890abcd and it is secret.';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('sk-ant-12345678901234567890abcd');
      expect(output).toContain('[REDACTED_API_KEY]');
    });

    it('redacts Bearer tokens', () => {
      const input = 'Authorization: Bearer mySecretTokenValue123==';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('mySecretTokenValue123==');
      expect(output).toContain('Bearer [REDACTED_BEARER_TOKEN]');
    });

    it('redacts emails', () => {
      const input = 'Send updates to student.john@university.edu please.';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('student.john@university.edu');
      expect(output).toContain('[REDACTED_EMAIL]');
    });

    it('redacts phone numbers', () => {
      const input = 'Contact me at +1-555-0199 or (555) 555-0125.';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('555-0199');
      expect(output).not.toContain('555-0125');
      expect(output).toContain('[REDACTED_PHONE_NUMBER]');
    });

    it('redacts credit cards', () => {
      const input = 'My card is 4111 1111 1111 1111.';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('4111');
      expect(output).toContain('[REDACTED_CREDIT_CARD]');
    });

    it('redacts passwords and secrets', () => {
      const input = 'Credentials: password: mySecretPassword123, pass=anotherPass';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('mySecretPassword123');
      expect(output).not.toContain('anotherPass');
      expect(output).toContain('password:[REDACTED_SECRET]');
    });

    it('redacts base64 images', () => {
      const input = 'Data URI is data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg== here.';
      const output = RedactionService.redactText(input);
      expect(output).not.toContain('iVBORw0KGgo');
      expect(output).toContain('[REDACTED_BASE64_IMAGE]');
    });

    it('truncates long text blocks by default', () => {
      const longText = 'A'.repeat(600);
      const output = RedactionService.redactText(longText);
      expect(output.length).toBeLessThan(200);
      expect(output).toContain('[LONG_TEXT_REDACTED_length_600]');
    });

    it('does not truncate long text blocks when dev override is enabled', () => {
      RedactionService.setDevOverride(true);
      const longText = 'A'.repeat(600);
      const output = RedactionService.redactText(longText);
      expect(output.length).toBe(600);
      expect(output).not.toContain('[LONG_TEXT_REDACTED');
    });
  });

  describe('redactMetadata', () => {
    it('deep cleans objects recursively', () => {
      const meta = {
        user: {
          email: 'test@example.com',
          password: 'supersecretpass',
        },
        screenshot: 'data:image/png;base64,iVBORw0KGgoAAAAN...',
        title: 'Safe Window',
        mode: 'hint',
      };

      const clean = RedactionService.redactMetadata(meta);
      expect(clean.user.email).toBe('[REDACTED_EMAIL]');
      expect(clean.user.password).toBe('[REDACTED]');
      expect(clean.screenshot).toBe('[REDACTED_SCREENSHOT]');
      expect(clean.title).toBe('Safe Window');
      expect(clean.mode).toBe('hint');
    });

    it('summarizes accessibility trees by default', () => {
      const meta = {
        accessibilityTree: {
          nodes: [{ id: '1', name: 'btn' }, { id: '2', name: 'lbl' }],
          focusedNode: { role: 'button' }
        }
      };

      const clean = RedactionService.redactMetadata(meta);
      expect(clean.accessibilityTree.nodesCount).toBe(2);
      expect(clean.accessibilityTree.focusedRole).toBe('button');
      expect(clean.accessibilityTree.nodes).toBeUndefined();
    });

    it('retains full accessibility trees when dev override is enabled', () => {
      RedactionService.setDevOverride(true);
      const meta = {
        accessibilityTree: {
          nodes: [{ id: '1', name: 'btn' }],
          focusedNode: { role: 'button' }
        }
      };

      const clean = RedactionService.redactMetadata(meta);
      expect(clean.accessibilityTree.nodes).toBeDefined();
      expect(clean.accessibilityTree.nodes[0].name).toBe('btn');
    });
  });

  describe('redactWindowTitle', () => {
    it('redacts private titles containing denylist terms', () => {
      const output = RedactionService.redactWindowTitle('1Password - Master Vault');
      expect(output).toBe('[REDACTED_PRIVATE_WINDOW_TITLE]');
    });

    it('retains safe window titles', () => {
      const output = RedactionService.redactWindowTitle('Vite App - main.ts');
      expect(output).toBe('Vite App - main.ts');
    });
  });

  describe('redactUrl', () => {
    it('strips query parameters', () => {
      const output = RedactionService.redactUrl('https://screentutor.ai/oauth/callback?token=abc&secret=xyz');
      expect(output).toBe('https://screentutor.ai/oauth/callback?[REDACTED_QUERY_PARAMS]');
    });

    it('retains safe URLs', () => {
      const output = RedactionService.redactUrl('https://screentutor.ai/dashboard');
      expect(output).toBe('https://screentutor.ai/dashboard');
    });
  });

  describe('summarizeQuestion', () => {
    it('returns generalized summaries for long questions', () => {
      const output = RedactionService.summarizeQuestion('Can you quiz me on derivatives of trigonometric functions?');
      expect(output).toContain('[Summarized quiz request: Can you quiz me on derivatives... (58 chars)]');
    });

    it('returns the full text for short questions', () => {
      const output = RedactionService.summarizeQuestion('Give me a hint.');
      expect(output).toBe('Give me a hint.');
    });

    it('bypasses summaries when dev override is enabled', () => {
      RedactionService.setDevOverride(true);
      const output = RedactionService.summarizeQuestion('Can you quiz me on derivatives of trigonometric functions?');
      expect(output).toBe('Can you quiz me on derivatives of trigonometric functions?');
    });
  });

  describe('summarizeScreenContext', () => {
    it('creates a clean summary of screenshots, active window and tree node counts', () => {
      const context = {
        screenshotBase64: 'data:image/png;base64,iVBOR...',
        windowTitle: 'Incognito Window - Secret Search',
        accessibilityTree: { nodes: [1, 2, 3, 4] },
        extraData: 'safe value'
      };

      const summary = RedactionService.summarizeScreenContext(context);
      expect(summary.screenshotSummary.present).toBe(true);
      expect(summary.screenshotBase64).toBeUndefined();
      expect(summary.windowTitleSummary.titleCleaned).toBe('[REDACTED_PRIVATE_WINDOW_TITLE]');
      expect(summary.accessibilityTreeSummary.nodesCount).toBe(4);
      expect(summary.extraData).toBe('safe value');
    });
  });
});
