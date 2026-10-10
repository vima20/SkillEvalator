import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { config } from "./config.js";

export async function produceArtifact(opts: {
  modelId: string;
  skillMd: string;
  inputPath: string;
  targetFile: string;
  subjectDir?: string;
  seed?: number;
}): Promise<{ content: string; costUsd: number }> {
  const input = fs.readFileSync(opts.inputPath, "utf8");
  if (!config.openaiApiKey) {
    throw new Error(
      "OPENAI_API_KEY missing; set the key or use FAKE_PRODUCE=known-good for smoke",
    );
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

  const client = new OpenAI({ apiKey: config.openaiApiKey });
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

  const res = await client.chat.completions.create({
    model: opts.modelId,
    temperature: config.temperature,
    top_p: config.topP,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    messages: [
      {
        role: "system",
        content:
          "You complete coding evaluation tasks. Follow the skill instructions exactly. Output only the requested source file body.",
      },
      { role: "user", content: prompt },
    ],
  });

  let content = res.choices[0]?.message?.content ?? "";
  content = stripFences(content);
  const inTok = res.usage?.prompt_tokens ?? 0;
  const outTok = res.usage?.completion_tokens ?? 0;
  const costUsd = (inTok * 0.15 + outTok * 0.6) / 1_000_000;
  return { content, costUsd };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
  if (m) return m[1].trim() + "\n";
  return s.trim() + "\n";
}
