/** Post-process streamed explanation text for readable math display. */
export function formatMathText(line: string): string {
  return line
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/\^(\d+)/g, '⁽$1⁾')
    .replace(/sqrt\s*\(([^)]+)\)/gi, '√($1)')
    .replace(/\*\*/g, '×')
    .replace(/->/g, '→')
    .replace(/=>/g, '⇒');
}

export function isStepLabelLine(line: string): boolean {
  return /^Step\s+\d+/i.test(line.trim());
}

/** Lines that look like standalone equations or algebra. */
export function isEquationLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (isStepLabelLine(t)) return false;
  if (/^[→⇒=]/.test(t)) return true;
  if (/[=²³√∫∑]/.test(t) && /[a-zA-Z0-9]/.test(t)) return true;
  if (/^\(?[a-zA-Z][^)]*\)?\s*[+\-^=]/.test(t)) return true;
  return false;
}
