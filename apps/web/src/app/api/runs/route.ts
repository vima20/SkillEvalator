import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jobsDir, resultsDir, skillsDir } from "@/lib/paths";

const Body = z.object({
  evalSkillId: z.string().min(1),
  mode: z.enum(["dry-run", "official"]),
  repeats: z.number().int().positive().default(1),
});

export async function GET() {
  const root = resultsDir();
  if (!fs.existsSync(root)) return NextResponse.json({ runs: [] });
  const runs = fs
    .readdirSync(root)
    .filter((d) => fs.existsSync(path.join(root, d, "status.json")))
    .map((id) => {
      const status = JSON.parse(
        fs.readFileSync(path.join(root, id, "status.json"), "utf8"),
      );
      return { runId: id, ...status };
    })
    .sort((a, b) => String(b.runId).localeCompare(String(a.runId)));
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const body = Body.parse(await req.json());
  const skillPath = path.join(skillsDir(), body.evalSkillId);
  if (!fs.existsSync(skillPath)) {
    return NextResponse.json({ error: "unknown skill" }, { status: 400 });
  }

  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const job = {
    runId,
    evalSkillId: body.evalSkillId,
    mode: body.mode,
    repeats: body.mode === "official" ? Math.max(body.repeats, 3) : body.repeats,
    createdAt: new Date().toISOString(),
  };

  const dir = jobsDir();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${runId}.tmp.json`);
  const final = path.join(dir, `${runId}.json`);
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2), "utf8");
  fs.renameSync(tmp, final);

  fs.mkdirSync(path.join(resultsDir(), runId), { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir(), runId, "status.json"),
    JSON.stringify({ runId, status: "queued" }, null, 2),
  );

  return NextResponse.json({ runId });
}
