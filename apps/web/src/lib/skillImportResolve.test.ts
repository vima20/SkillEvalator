import { describe, expect, it } from "vitest";
import {
  SKILL_IMPORT_FAILED,
  SKILL_IMPORT_FILE_REQUIRED,
  SKILL_IMPORT_GITHUB_URL_INVALID,
  SKILL_IMPORT_LOCK_BUSY,
  SKILL_IMPORT_NO_SKILLS_FOUND,
  SKILL_IMPORT_ZIP_REQUIRED,
  classifySkillImportError,
  knownSkillImportErrorCodes,
  resolveSkillImportPostError,
} from "./skillImportResolve.js";

describe("classifySkillImportError", () => {
  it("maps core messages to stable codes and statuses", () => {
    expect(classifySkillImportError("import already in progress for x")).toEqual(
      {
        status: 503,
        errorCode: "skill_import_lock_busy",
        error: "import already in progress for x",
      },
    );
    expect(
      classifySkillImportError("No SkillEvalator skills found (need fixtures)"),
    ).toMatchObject({
      status: 400,
      errorCode: "skill_import_no_skills_found",
    });
    expect(
      classifySkillImportError("only github.com repositories are supported"),
    ).toMatchObject({
      status: 400,
      errorCode: "skill_import_github_url_invalid",
    });
    expect(classifySkillImportError("empty archive")).toMatchObject({
      status: 400,
      errorCode: "skill_import_empty_archive",
    });
    expect(classifySkillImportError("archive too large (>50MB)")).toMatchObject(
      {
        status: 400,
        errorCode: "skill_import_archive_too_large",
      },
    );
    expect(classifySkillImportError("zip-slip blocked: ../x")).toMatchObject({
      status: 400,
      errorCode: "skill_import_unsafe_archive",
    });
    expect(classifySkillImportError("path not found in repo: foo")).toMatchObject(
      {
        status: 400,
        errorCode: "skill_import_path_not_found",
      },
    );
    expect(classifySkillImportError("unexpected boom")).toMatchObject({
      status: 500,
      errorCode: "skill_import_failed",
    });
  });
});

describe("resolveSkillImportPostError", () => {
  it("fail-closes known codes without body.error", () => {
    expect(
      resolveSkillImportPostError({ errorCode: "skill_import_file_required" }),
    ).toBe(SKILL_IMPORT_FILE_REQUIRED);
    expect(
      resolveSkillImportPostError({ errorCode: "skill_import_zip_required" }),
    ).toBe(SKILL_IMPORT_ZIP_REQUIRED);
    expect(
      resolveSkillImportPostError({
        errorCode: "skill_import_github_url_invalid",
      }),
    ).toBe(SKILL_IMPORT_GITHUB_URL_INVALID);
    expect(
      resolveSkillImportPostError({ errorCode: "skill_import_lock_busy" }),
    ).toBe(SKILL_IMPORT_LOCK_BUSY);
    expect(
      resolveSkillImportPostError({
        errorCode: "skill_import_no_skills_found",
      }),
    ).toBe(SKILL_IMPORT_NO_SKILLS_FOUND);
    expect(resolveSkillImportPostError({})).toBe(SKILL_IMPORT_FAILED);
  });

  it("prefers body.error when provided", () => {
    expect(
      resolveSkillImportPostError({
        errorCode: "skill_import_lock_busy",
        error: "import already in progress for demo-skill",
      }),
    ).toMatch(/demo-skill/);
  });

  it("lists all known codes", () => {
    expect(knownSkillImportErrorCodes()).toContain("skill_import_failed");
    expect(knownSkillImportErrorCodes().length).toBeGreaterThanOrEqual(10);
  });

  it("POST /api/skills and NewRunForm use skill import codes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const route = fs.readFileSync(
      path.join(cwd, "src/app/api/skills/route.ts"),
      "utf8",
    );
    expect(route).toMatch(/classifySkillImportError/);
    expect(route).toMatch(/skill_import_file_required/);
    expect(route).toMatch(/skill_import_invalid_request/);
    expect(route).toMatch(/errorCode: classified\.errorCode/);
    const form = fs.readFileSync(
      path.join(cwd, "src/app/NewRunForm.tsx"),
      "utf8",
    );
    expect(form).toMatch(/resolveSkillImportPostError/);
    expect(form).toMatch(
      /resolveSkillImportPostError\(\{\s*errorCode:\s*"skill_import_failed"/,
    );
    expect(form).not.toMatch(/import error/);
    expect(form).not.toMatch(/Failed to fetch/);
  });
});
