import { BASELINE_NEUTRAL_PROMPT } from "./prompts.js";

export type ProducePromptKind = "baseline_neutral" | "skill_md";

/** Resolve Unikie produce instruction + kind from role. */
export function resolveProduceInstruction(opts: {
  role?: "baseline" | "candidate";
  skillMd: string;
}): { instruction: string; promptKind: ProducePromptKind } {
  const role = opts.role ?? "candidate";
  if (role === "baseline") {
    return {
      instruction: BASELINE_NEUTRAL_PROMPT,
      promptKind: "baseline_neutral",
    };
  }
  const trimmed = opts.skillMd.trim();
  if (!trimmed) {
    throw new Error(
      "candidate skillMd empty — refusing silent baseline_neutral fallback (would invalidate lift)",
    );
  }
  return {
    instruction: trimmed,
    promptKind: "skill_md",
  };
}

export function resolveProduceSystemContent(
  role: "baseline" | "candidate" = "candidate",
): string {
  return role === "baseline"
    ? "You complete coding evaluation tasks using only the neutral instructions. Output only the requested source file body."
    : "You complete coding evaluation tasks. Follow the skill instructions exactly. Output only the requested source file body.";
}
