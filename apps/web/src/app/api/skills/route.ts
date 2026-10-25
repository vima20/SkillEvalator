import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  SKILL_IMPORT_MAX_ZIP_BYTES,
  importSkillsFromGitHub,
  importSkillsFromZip,
  listSkills,
  normalizeAgentSkillWrapProfile,
} from "@skillevalator/core";
import { importedSkillsDir, skillsDir, skillsDirs } from "@/lib/paths";
import { enrichSkillsWithImportMeta } from "@/lib/skillListEnrich";
import {
  SKILL_IMPORT_FILE_REQUIRED,
  SKILL_IMPORT_INVALID_REQUEST,
  SKILL_IMPORT_ZIP_REQUIRED,
  classifySkillImportError,
} from "@/lib/skillImportResolve";

export const dynamic = "force-dynamic";

const ImportBody = z.object({
  url: z.string().min(3),
  ref: z.string().min(1).optional(),
  wrapProfile: z.enum(["cde-v1", "tge-v1"]).optional(),
});

export async function GET() {
  return NextResponse.json({
    skills: enrichSkillsWithImportMeta(listSkills(skillsDirs())),
  });
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
          {
            error: SKILL_IMPORT_FILE_REQUIRED,
            errorCode: "skill_import_file_required",
          },
          { status: 400 },
        );
      }
      const name = (file.name || "skill.zip").trim();
      if (!name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json(
          {
            error: SKILL_IMPORT_ZIP_REQUIRED,
            errorCode: "skill_import_zip_required",
          },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.byteLength > SKILL_IMPORT_MAX_ZIP_BYTES) {
        const mb = Math.round(SKILL_IMPORT_MAX_ZIP_BYTES / 1024 / 1024);
        return NextResponse.json(
          {
            error: `archive too large (>${mb}MB)`,
            errorCode: "skill_import_archive_too_large",
          },
          { status: 400 },
        );
      }
      const wrapProfile = normalizeAgentSkillWrapProfile(
        typeof form.get("wrapProfile") === "string"
          ? form.get("wrapProfile")
          : undefined,
      );
      const imported = importSkillsFromZip({
        zipBytes: buf,
        sourceLabel: name,
        importedSkillsDir: importedSkillsDir(),
        tasksetSearchDirs: [skillsDir()],
        agentWrapProfile: wrapProfile,
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
      agentWrapProfile: normalizeAgentSkillWrapProfile(body.wrapProfile),
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
        {
          error: SKILL_IMPORT_INVALID_REQUEST,
          errorCode: "skill_import_invalid_request",
          details: err.flatten(),
        },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "import failed";
    const classified = classifySkillImportError(message);
    return NextResponse.json(
      {
        error: classified.error,
        errorCode: classified.errorCode,
      },
      { status: classified.status },
    );
  }
}
