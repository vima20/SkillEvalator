/**
 * Extract source from an LLM reply. Prefers the last fenced JS block so a
 * short explanation before the real file does not become the artifact.
 */
export function stripCodeFences(s: string): string {
  const re = /```(?:javascript|js)?\s*([\s\S]*?)```/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    last = m[1] ?? null;
  }
  if (last !== null) return `${last.trim()}\n`;
  return `${s.trim()}\n`;
}
