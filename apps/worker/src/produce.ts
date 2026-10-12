import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { costFromTokenUsage, stripCodeFences } from "@skillevalator/core";
import { config } from "./config.js";

export class ProduceCancelledError extends Error {
  code = "cancelled" as const;
  constructor() {
    super("produce cancelled");
    this.name = "ProduceCancelledError";
  }
}

/** Unikie baseline: same model/tasks, no skill SKILL.md (neutral KH-style prompt). */
export const BASELINE_NEUTRAL_PROMPT = `You are a coding assistant helping with a small JavaScript task.
Fix or complete the requested file so it behaves correctly.
Return only the complete source for the output file. No markdown fences. No explanation.`;

export async function produceArtifact(opts: {
  modelId: string;
  /** Candidate skill prompt; ignored when role is baseline. */
  skillMd: string;
  /** baseline = neutral prompt; candidate = skillMd. */
  role?: "baseline" | "candidate";
  inputPath: string;
  targetFile: string;
  subjectDir?: string;
  seed?: number;
  /** When this file appears, abort the in-flight OpenAI request. */
  cancelPath?: string;
}): Promise<{
  content: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  /** Instruction text used (baseline neutral or SKILL.md body). */
  instruction: string;
  promptKind: "baseline_neutral" | "skill_md";
}> {
  const inputSt = fs.lstatSync(opts.inputPath);
  if (inputSt.isSymbolicLink()) {
    throw new Error(`symlink not allowed for input: ${opts.inputPath}`);
  }
  if (!inputSt.isFile()) {
    throw new Error(`input is not a regular file: ${opts.inputPath}`);
  }
  const input = fs.readFileSync(opts.inputPath, "utf8");
  if (!config.openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY missing; set the key or use FAKE_PRODUCE=known-good for smoke",
    );
  }

  if (opts.cancelPath && fs.existsSync(opts.cancelPath)) {
    throw new ProduceCancelledError();
  }

  const subjectBlocks: string[] = [];
  if (opts.subjectDir && fs.existsSync(opts.subjectDir)) {
    for (const name of fs.readdirSync(opts.subjectDir).sort()) {
      const p = path.join(opts.subjectDir, name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) {
        throw new Error(`symlink not allowed in subject: ${name}`);
      }
      if (!st.isFile()) continue;
      subjectBlocks.push(
        `Subject file ${name}:`,
        "```javascript",
        fs.readFileSync(p, "utf8").trimEnd(),
        "```",
        "",
      );
    }
  }

  const role = opts.role ?? "candidate";
  const promptKind =
    role === "baseline" ? ("baseline_neutral" as const) : ("skill_md" as const);
  const instruction =
    role === "baseline"
      ? BASELINE_NEUTRAL_PROMPT
      : opts.skillMd.trim() || BASELINE_NEUTRAL_PROMPT;

  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: config.openaiTimeoutMs,
    maxRetries: 0,
  });
  const prompt = [
    instruction,
    "",
    `Output file name: ${opts.targetFile}`,
    "",
    ...subjectBlocks,
    "Input / starter:",
    "```javascript",
    input,
    "```",
    "",
    `Return only the complete ${opts.targetFile} source. No markdown fences. No explanation.`,
  ].join("\n");

  const controller = new AbortController();
  let cancelRequested = false;
  const timer = setTimeout(() => controller.abort(), config.openaiTimeoutMs);
  const cancelPoll =
    opts.cancelPath != null
      ? setInterval(() => {
          if (opts.cancelPath && fs.existsSync(opts.cancelPath)) {
            cancelRequested = true;
            try {
              controller.abort();
            } catch {
              /* ignore */
            }
          }
        }, 250)
      : null;

  try {
    const systemContent =
      role === "baseline"
        ? "You complete coding evaluation tasks using only the neutral instructions. Output only the requested source file body."
        : "You complete coding evaluation tasks. Follow the skill instructions exactly. Output only the requested source file body.";
    const res = await client.chat.completions.create(
      {
        model: opts.modelId,
        temperature: config.temperature,
        top_p: config.topP,
        max_tokens: config.maxOutputTokens,
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        messages: [
          {
            role: "system",
            content: systemContent,
          },
          { role: "user", content: prompt },
        ],
      },
      { signal: controller.signal },
    );

    let content = res.choices[0]?.message?.content ?? "";
    content = stripCodeFences(content);
    const inTok = res.usage?.prompt_tokens ?? 0;
    const outTok = res.usage?.completion_tokens ?? 0;
    const costUsd = costFromTokenUsage(opts.modelId, inTok, outTok);
    return {
      content,
      costUsd,
      promptTokens: inTok,
      completionTokens: outTok,
      instruction,
      promptKind,
    };
  } catch (err) {
    if (
      cancelRequested ||
      (opts.cancelPath && fs.existsSync(opts.cancelPath))
    ) {
      throw new ProduceCancelledError();
    }
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name?: string }).name === "AbortError"
    ) {
      throw new Error(
        `OpenAI request timed out after ${config.openaiTimeoutMs}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (cancelPoll) clearInterval(cancelPoll);
  }
}
