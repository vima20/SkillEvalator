import fs from "node:fs";
import OpenAI from "openai";
import { config } from "./config.js";

export async function produceArtifact(opts: {
  modelId: string;
  skillMd: string;
  inputPath: string;
  targetFile: string;
  seed?: number;
}): Promise<{ content: string; costUsd: number }> {
  const broken = fs.readFileSync(opts.inputPath, "utf8");
  if (!config.openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY missing; set the key or use FAKE_PRODUCE=known-good for smoke",
    );
  }

  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const prompt = [
    opts.skillMd.trim(),
    "",
    `File name: ${opts.targetFile}`,
    "Buggy file:",
    "```javascript",
    broken,
    "```",
    "Return only the fixed file body.",
  ].join("\n");

  const res = await client.chat.completions.create({
    model: opts.modelId,
    temperature: config.temperature,
    top_p: config.topP,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    messages: [
      {
        role: "system",
        content: "You fix buggy JavaScript. Output only the corrected source file.",
      },
      { role: "user", content: prompt },
    ],
  });

  let content = res.choices[0]?.message?.content ?? "";
  content = stripFences(content);
  const inTok = res.usage?.prompt_tokens ?? 0;
  const outTok = res.usage?.completion_tokens ?? 0;
  // Approximate gpt-4o-mini-class pricing; cap is advisory for MVP.
  const costUsd = (inTok * 0.15 + outTok * 0.6) / 1_000_000;
  return { content, costUsd };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim() + "\n";
  return s.trim() + "\n";
}
