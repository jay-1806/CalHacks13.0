/**
 * Incrementally extracts the decoded value of one top-level string field from a
 * JSON object that arrives in arbitrary chunks (e.g. a structured-output stream).
 *
 * Emits only the field's characters, with JSON escapes decoded, so callers can
 * forward partial `spokenText` to the client without ever seeing raw JSON.
 */
export class JsonStringFieldStreamer {
  private buffer = '';
  private scanPos = 0;
  private state: 'searching' | 'inValue' | 'finished' = 'searching';
  private pendingEscape = '';

  constructor(
    private readonly field: string,
    private readonly onChars: (text: string) => void
  ) {}

  get finished(): boolean {
    return this.state === 'finished';
  }

  push(chunk: string): void {
    if (this.state === 'finished') return;
    this.buffer += chunk;

    if (this.state === 'searching') {
      const match = new RegExp(`"${this.field}"\\s*:\\s*"`).exec(this.buffer.slice(this.scanPos));
      if (!match) {
        // Keep enough tail to match a key split across chunks.
        this.scanPos = Math.max(0, this.buffer.length - (this.field.length + 8));
        return;
      }
      this.scanPos += match.index + match[0].length;
      this.state = 'inValue';
    }

    let out = '';
    while (this.scanPos < this.buffer.length) {
      const ch = this.buffer[this.scanPos++];

      if (this.pendingEscape) {
        this.pendingEscape += ch;
        if (this.pendingEscape[1] === 'u') {
          if (this.pendingEscape.length < 6) continue;
          out += String.fromCharCode(parseInt(this.pendingEscape.slice(2), 16));
        } else {
          out += decodeSimpleEscape(this.pendingEscape[1]);
        }
        this.pendingEscape = '';
        continue;
      }

      if (ch === '\\') {
        this.pendingEscape = ch;
        continue;
      }
      if (ch === '"') {
        this.state = 'finished';
        break;
      }
      out += ch;
    }

    if (out) this.onChars(out);
  }
}

function decodeSimpleEscape(ch: string): string {
  switch (ch) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case 'b': return '\b';
    case 'f': return '\f';
    default: return ch; // covers \" \\ \/
  }
}

/**
 * Incrementally yields each complete object of one top-level array field (e.g.
 * `"steps": [{...}, {...}]`) from JSON that arrives in arbitrary chunks, so each
 * element can be used as soon as its closing brace has been generated.
 */
export class JsonArrayItemStreamer {
  private buffer = '';
  private scanPos = 0;
  private state: 'searching' | 'inArray' | 'finished' = 'searching';
  private itemStart = -1;
  private depth = 0;
  private inString = false;
  private escaped = false;

  constructor(
    private readonly field: string,
    private readonly onItem: (item: unknown) => void
  ) {}

  push(chunk: string): void {
    if (this.state === 'finished') return;
    this.buffer += chunk;

    if (this.state === 'searching') {
      const match = new RegExp(`"${this.field}"\\s*:\\s*\\[`).exec(this.buffer.slice(this.scanPos));
      if (!match) {
        this.scanPos = Math.max(0, this.buffer.length - (this.field.length + 8));
        return;
      }
      this.scanPos += match.index + match[0].length;
      this.state = 'inArray';
    }

    while (this.scanPos < this.buffer.length) {
      const ch = this.buffer[this.scanPos];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') this.inString = false;
      } else if (ch === '"') {
        this.inString = true;
      } else if (ch === '{') {
        if (this.depth === 0) this.itemStart = this.scanPos;
        this.depth++;
      } else if (ch === '}') {
        this.depth--;
        if (this.depth === 0 && this.itemStart >= 0) {
          const text = this.buffer.slice(this.itemStart, this.scanPos + 1);
          this.itemStart = -1;
          try {
            this.onItem(JSON.parse(text));
          } catch {
            // A malformed element is skipped; the final, validated answer still has it.
          }
        }
      } else if (ch === ']' && this.depth === 0) {
        this.state = 'finished';
        this.scanPos++;
        return;
      }
      this.scanPos++;
    }
  }
}
