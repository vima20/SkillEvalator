import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  assertSafeId,
  createJobManifest,
  listRuns,
  resolveUnder,
  writeJsonFile,
} from "@skillevalator/core";
import { jobsDir, resultsDir, skillsDir } from "@/lib/paths";

const Body = z.object({
  evalSkillId: z.string().min(1),
  mode: z.enum(["dry-run", "official"]),
  repeats: z.number().int().positive().max(10).default(1),
});

export async function GET() {
  const runs = listRuns(resultsDir()).map(({ runId, status, result }) => ({
    runId,
    status,
    score: result?.score ?? null,
    modelId: result?.modelId,
    mode: result?.mode,
  }));
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const evalSkillId = assertSafeId(body.evalSkillId, "evalSkillId");
    const skillPath = resolveUnder(skillsDir(), evalSkillId);
    if (!fs.existsSync(skillPath)) {
      return NextResponse.json({ error: "unknown skill" }, { status: 400 });
    }

    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const job = createJobManifest({
      runId,
      evalSkillId,
      mode: body.mode,
      repeats: body.repeats,
    });

    const dir = jobsDir();
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `${runId}.tmp.json`);
    const final = path.join(dir, `${runId}.json`);
    writeJsonFile(tmp, job);
    fs.renameSync(tmp, final);

    writeJsonFile(path.join(resultsDir(), runId, "status.json"), {
      runId,
      status: "queued",
    });

    return NextResponse.json({ runId });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "error";
    const status = message.startsWith("invalid ") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
