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
