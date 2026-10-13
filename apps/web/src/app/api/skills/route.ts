import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  SKILL_IMPORT_MAX_ZIP_BYTES,
  importSkillsFromGitHub,
  importSkillsFromZip,
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

/**
 * Unikie Find/Receive:
 * - JSON { url } → GitHub import
 * - multipart file → local zip package
 */
export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "multipart field 'file' (zip) required" },
          { status: 400 },
        );
      }
      const name = (file.name || "skill.zip").trim();
      if (!name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json(
          { error: "only .zip packages are supported" },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength > SKILL_IMPORT_MAX_ZIP_BYTES) {
        return NextResponse.json(
          {
            error: `archive too large (>${Math.round(SKILL_IMPORT_MAX_ZIP_BYTES / 1024 / 1024)}MB)`,
          },
          { status: 400 },
        );
      }
      const imported = importSkillsFromZip({
        zipBytes: buf,
        sourceLabel: name,
        importedSkillsDir: importedSkillsDir(),
        tasksetSearchDirs: [skillsDir()],
      });
      return NextResponse.json({
        ok: true,
        source: "local-zip",
        sourceLabel: imported.sourceLabel,
        skills: imported.skills,
        allSkills: listSkills(skillsDirs()),
      });
    }

    const body = ImportBody.parse(await req.json());
    const imported = await importSkillsFromGitHub({
      url: body.url,
      ref: body.ref,
      importedSkillsDir: importedSkillsDir(),
      tasksetSearchDirs: [skillsDir()],
    });
    return NextResponse.json({
      ok: true,
      source: "github",
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
      message.includes("No SkillEvalator") ||
      message.includes("empty archive") ||
      message.includes("too large") ||
      message.includes(".zip")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
