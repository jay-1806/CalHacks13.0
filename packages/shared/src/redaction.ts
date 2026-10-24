import { PRIVACY_DENYLIST } from './privacy.js';

export class RedactionService {
  private static devOverride = false;

  public static setDevOverride(enabled: boolean): void {
    this.devOverride = enabled;
  }

  public static isDevOverrideEnabled(): boolean {
    if (this.devOverride) {
      return true;
    }
    if (typeof process !== 'undefined' && process.env && process.env.DEV_OVERRIDE_REDACTION === 'true') {
      return true;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage.getItem('screentutor_dev_override_redaction') === 'true';
    }
    return false;
  }

  /**
   * Redacts sensitive patterns inside a string.
   */
  public static redactText(text: string): string {
    if (!text) return text;
    
    let redacted = text;

    // 1. Redact Base64 image data / screenshots
    redacted = redacted.replace(/data:image\/[a-zA-Z+]+;base64,[a-zA-Z0-9+/=]+/gi, '[REDACTED_BASE64_IMAGE]');

    // 2. Redact API keys: sk-[a-zA-Z0-9-_]{20,} or standard patterns
    redacted = redacted.replace(/(sk-[a-zA-Z0-9-_]{20,})/gi, '[REDACTED_API_KEY]');

    // 3. Redact Bearer tokens
    redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_BEARER_TOKEN]');

    // 4. Redact Emails
    redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[REDACTED_EMAIL]');

    // 5. Redact Phone numbers (standard formats, 7-digit and 10-digit)
    redacted = redacted.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\b\d{3}[-.\s]?\d{4}\b/g, '[REDACTED_PHONE_NUMBER]');

    // 6. Redact Credit cards
    redacted = redacted.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CREDIT_CARD]');

    // 7. Redact Passwords / Secrets in patterns like password=xyz or pass: abc
    redacted = redacted.replace(/\b(password|passwd|pass|secret)(?:\s*[:=]\s*)(\S+)/gi, '$1:[REDACTED_SECRET]');

    // 8. Truncate/redact long text blocks (greater than 500 characters)
    if (redacted.length > 500 && !this.isDevOverrideEnabled()) {
      redacted = redacted.substring(0, 100) + `... [LONG_TEXT_REDACTED_length_${redacted.length}]`;
    }

    return redacted;
  }

  /**
   * Recursively traverses metadata objects/arrays and redacts sensitive keys and values.
   */
  public static redactMetadata(metadata: any): any {
    if (metadata === null || metadata === undefined) {
      return metadata;
    }

    if (typeof metadata === 'string') {
      return this.redactText(metadata);
    }

    if (Array.isArray(metadata)) {
      return metadata.map(item => this.redactMetadata(item));
    }

    if (typeof metadata === 'object') {
      if (metadata instanceof Error) {
        return this.redactError(metadata);
      }

      const redactedObj: Record<string, any> = {};
      for (const [key, value] of Object.entries(metadata)) {
        const lowerKey = key.toLowerCase();
        
        if (['screenshot', 'screenshotbase64', 'base64', 'image'].some(k => lowerKey.includes(k))) {
          redactedObj[key] = '[REDACTED_SCREENSHOT]';
          if (lowerKey === 'screenshot' || lowerKey === 'screenshotbase64') {
            redactedObj[key + 'Present'] = !!value;
          }
        }
        else if (['apikey', 'password', 'secret', 'credentials', 'token', 'bearer'].some(k => lowerKey.includes(k))) {
          redactedObj[key] = '[REDACTED]';
        }
        else if (['windowtitle', 'title'].some(k => lowerKey.includes(k))) {
          redactedObj[key] = typeof value === 'string' ? this.redactWindowTitle(value) : value;
          if (lowerKey === 'windowtitle') {
            redactedObj['windowTitlePresent'] = !!value;
          }
        }
        else if (lowerKey === 'accessibilitytree') {
          redactedObj['accessibilityTreeNodesCount'] = (value as any)?.nodes?.length || 0;
          if (this.isDevOverrideEnabled()) {
            redactedObj[key] = this.redactMetadata(value);
          } else {
            redactedObj[key] = {
              nodesCount: (value as any)?.nodes?.length || 0,
              focusedRole: (value as any)?.focusedNode?.role || 'unknown',
              redacted: true
            };
          }
        }
        else if (['question', 'prompt', 'userquestion'].some(k => lowerKey === k)) {
          redactedObj[key] = typeof value === 'string' ? this.summarizeQuestion(value) : value;
        }
        else {
          redactedObj[key] = this.redactMetadata(value);
        }
      }
      return redactedObj;
    }

    return metadata;
  }

  /**
   * Redacts private window titles based on denylist.
   */
  public static redactWindowTitle(title: string): string {
    if (!title) return title;
    const lower = title.toLowerCase();
    const matchesDeny = PRIVACY_DENYLIST.some(term => lower.includes(term));
    if (matchesDeny) {
      return '[REDACTED_PRIVATE_WINDOW_TITLE]';
    }
    return this.redactText(title);
  }

  /**
   * Redacts query parameters in URLs.
   */
  public static redactUrl(url: string): string {
    if (!url) return url;
    try {
      if (url.includes('?')) {
        const parts = url.split('?');
        return parts[0] + '?[REDACTED_QUERY_PARAMS]';
      }
    } catch (e) {
      // fallback
    }
    return this.redactText(url);
  }

  /**
   * Redacts error details.
   */
  public static redactError(error: any): any {
    if (!error) return error;
    
    if (typeof error === 'string') {
      return this.redactText(error);
    }

    const safeError: Record<string, any> = {};
    
    if (error.name) safeError.name = this.redactText(error.name);
    if (error.message) safeError.message = this.redactText(error.message);
    if (error.stack) safeError.stack = this.redactText(error.stack);
    
    for (const [key, value] of Object.entries(error)) {
      if (['name', 'message', 'stack'].includes(key)) continue;
      safeError[key] = this.redactMetadata(value);
    }

    return safeError;
  }

  /**
   * Summarizes the user question.
   */
  public static summarizeQuestion(question: string): string {
    if (!question) return question;
    if (this.isDevOverrideEnabled()) {
      return this.redactText(question);
    }
    const clean = this.redactText(question);
    if (clean.length <= 30) {
      return clean;
    }
    const lower = clean.toLowerCase();
    let type = 'general query';
    if (lower.includes('quiz')) type = 'quiz request';
    else if (lower.includes('hint')) type = 'hint request';
    else if (lower.includes('error') || lower.includes('bug') || lower.includes('wrong')) type = 'debugging request';
    else if (lower.includes('explain') || lower.includes('why')) type = 'explanation request';
    
    return `[Summarized ${type}: ${clean.substring(0, 30)}... (${clean.length} chars)]`;
  }

  /**
   * Summarizes the screen context.
   */
  public static summarizeScreenContext(screenContext: any): any {
    if (!screenContext) return null;
    if (this.isDevOverrideEnabled()) {
      return this.redactMetadata(screenContext);
    }

    const summary: any = {};
    if (screenContext.screenshot || screenContext.screenshotBase64 || screenContext.base64) {
      summary.screenshotSummary = {
        present: true,
        type: 'base64_png',
        redacted: true
      };
    }
    if (screenContext.windowTitle) {
      summary.windowTitleSummary = {
        redacted: true,
        titleCleaned: this.redactWindowTitle(screenContext.windowTitle)
      };
    }
    if (screenContext.accessibilityTree) {
      summary.accessibilityTreeSummary = {
        nodesCount: screenContext.accessibilityTree.nodes?.length || 0,
        focusedRole: screenContext.accessibilityTree.focusedNode?.role || 'unknown',
        redacted: true
      };
    }

    for (const [k, v] of Object.entries(screenContext)) {
      if (['screenshot', 'screenshotBase64', 'base64', 'windowTitle', 'accessibilityTree'].includes(k)) {
        continue;
      }
      summary[k] = this.redactMetadata(v);
    }

    return summary;
  }
}

export function patchConsole() {
  if (typeof console === 'undefined') return;
  if ((console as any).__redacted) return;
  (console as any).__redacted = true;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  const redactArgs = (args: any[]) => {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return RedactionService.redactText(arg);
      }
      if (arg instanceof Error) {
        return RedactionService.redactError(arg);
      }
      if (typeof arg === 'object' && arg !== null) {
        return RedactionService.redactMetadata(arg);
      }
      return arg;
    });
  };

  console.log = (...args: any[]) => originalLog(...redactArgs(args));
  console.warn = (...args: any[]) => originalWarn(...redactArgs(args));
  console.error = (...args: any[]) => originalError(...redactArgs(args));
  console.info = (...args: any[]) => originalInfo(...redactArgs(args));
  console.debug = (...args: any[]) => originalDebug(...redactArgs(args));
}
