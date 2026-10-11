import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { config } from "./config.js";

export class ProduceCancelledError extends Error {
  code = "cancelled" as const;
  constructor() {
    super("produce cancelled");
    this.name = "ProduceCancelledError";
  }
}

export async function produceArtifact(opts: {
  modelId: string;
  skillMd: string;
  inputPath: string;
  targetFile: string;
  subjectDir?: string;
  seed?: number;
  /** When this file appears, abort the in-flight OpenAI request. */
  cancelPath?: string;
}): Promise<{ content: string; costUsd: number }> {
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
      if (!fs.statSync(p).isFile()) continue;
      subjectBlocks.push(
        `Subject file ${name}:`,
        "```javascript",
        fs.readFileSync(p, "utf8").trimEnd(),
        "```",
        "",
      );
    }
  }

  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    timeout: config.openaiTimeoutMs,
    maxRetries: 0,
  });
  const prompt = [
    opts.skillMd.trim(),
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
            content:
              "You complete coding evaluation tasks. Follow the skill instructions exactly. Output only the requested source file body.",
          },
          { role: "user", content: prompt },
        ],
      },
      { signal: controller.signal },
    );

    let content = res.choices[0]?.message?.content ?? "";
    content = stripFences(content);
    const inTok = res.usage?.prompt_tokens ?? 0;
    const outTok = res.usage?.completion_tokens ?? 0;
    const costUsd = (inTok * 0.15 + outTok * 0.6) / 1_000_000;
    return { content, costUsd };
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

function stripFences(s: string): string {
  const m = s.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim() + "\n";
  return s.trim() + "\n";
}
