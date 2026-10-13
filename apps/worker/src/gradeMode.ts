/**
 * Host grade is a smoke/lab escape hatch — never with live OpenAI produce.
 */
export function shouldUseHostGrade(opts: {
  allowHostGrade: boolean;
  fakeProduce: string | undefined;
}): boolean {
  return opts.allowHostGrade && opts.fakeProduce === "known-good";
}
