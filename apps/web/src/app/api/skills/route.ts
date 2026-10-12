import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  importSkillsFromGitHub,
  listSkills,
} from "@skillevalator/core";
import { importedSkillsDir, skillsDir, skillsDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

const ImportBody = z.object({
  url: z.string().min(3),
  ref: z.string().min(1).optional(),
});

export async function GET() {
  return NextResponse.json({ skills: listSkills(skillsDirs()) });
}

/** Unikie Find/Receive: import skill package from GitHub (repo + ref/commit). */
export async function POST(req: Request) {
  try {
    const body = ImportBody.parse(await req.json());
    const imported = await importSkillsFromGitHub({
      url: body.url,
      ref: body.ref,
      importedSkillsDir: importedSkillsDir(),
      tasksetSearchDirs: [skillsDir()],
    });
    return NextResponse.json({
      ok: true,
      ref: imported.ref,
      skills: imported.skills,
      allSkills: listSkills(skillsDirs()),
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "import failed";
    const status =
      message.startsWith("invalid ") ||
      message.includes("github.com") ||
      message.includes("https") ||
      message.includes("No SkillEvalator")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
