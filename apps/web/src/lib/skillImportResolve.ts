/**
 * Fail-closed copy for Find/Receive POST /api/skills errorCodes.
 * Prefer body.error when present (core messages carry dynamic detail).
 */

export type SkillImportErrorCode =
  | "skill_import_invalid_request"
  | "skill_import_file_required"
  | "skill_import_zip_required"
  | "skill_import_archive_too_large"
  | "skill_import_empty_archive"
  | "skill_import_github_url_invalid"
  | "skill_import_no_skills_found"
  | "skill_import_lock_busy"
  | "skill_import_path_not_found"
  | "skill_import_unsafe_archive"
  | "skill_import_harness_missing"
  | "skill_import_failed";

export type SkillImportPostErrorBody = {
  error?: string;
  errorCode?: string;
};

export const SKILL_IMPORT_FILE_REQUIRED =
  "multipart field 'file' (zip) required";
export const SKILL_IMPORT_ZIP_REQUIRED = "only .zip packages are supported";
export const SKILL_IMPORT_ARCHIVE_TOO_LARGE = "archive too large";
export const SKILL_IMPORT_EMPTY_ARCHIVE = "empty archive";
export const SKILL_IMPORT_GITHUB_URL_INVALID = "invalid GitHub URL";
export const SKILL_IMPORT_NO_SKILLS_FOUND =
  "No skills found (need fixtures/manifest.json or SKILL.md)";
export const SKILL_IMPORT_LOCK_BUSY =
  "import already in progress — try again shortly";
export const SKILL_IMPORT_PATH_NOT_FOUND = "path not found in repo";
export const SKILL_IMPORT_UNSAFE_ARCHIVE =
  "archive rejected (unsafe paths or file types)";
export const SKILL_IMPORT_INVALID_REQUEST = "invalid request";
export const SKILL_IMPORT_HARNESS_MISSING =
  "Agent skill wrap needs eval-skills/code-debugging-eval on disk (cde-v1 harness)";
export const SKILL_IMPORT_FAILED = "Import failed";

const FAIL_CLOSED: Record<SkillImportErrorCode, string> = {
  skill_import_invalid_request: SKILL_IMPORT_INVALID_REQUEST,
  skill_import_file_required: SKILL_IMPORT_FILE_REQUIRED,
  skill_import_zip_required: SKILL_IMPORT_ZIP_REQUIRED,
  skill_import_archive_too_large: SKILL_IMPORT_ARCHIVE_TOO_LARGE,
  skill_import_empty_archive: SKILL_IMPORT_EMPTY_ARCHIVE,
  skill_import_github_url_invalid: SKILL_IMPORT_GITHUB_URL_INVALID,
  skill_import_no_skills_found: SKILL_IMPORT_NO_SKILLS_FOUND,
  skill_import_lock_busy: SKILL_IMPORT_LOCK_BUSY,
  skill_import_path_not_found: SKILL_IMPORT_PATH_NOT_FOUND,
  skill_import_unsafe_archive: SKILL_IMPORT_UNSAFE_ARCHIVE,
  skill_import_harness_missing: SKILL_IMPORT_HARNESS_MISSING,
  skill_import_failed: SKILL_IMPORT_FAILED,
};

/**
 * Classify core / route skill-import Error messages into status + errorCode.
 * Used by POST /api/skills catch — prefer keeping original message as error.
 */
export function classifySkillImportError(message: string): {
  status: number;
  errorCode: SkillImportErrorCode;
  error: string;
} {
  const error = message.trim() || SKILL_IMPORT_FAILED;

  if (error.includes("import already in progress")) {
    return { status: 503, errorCode: "skill_import_lock_busy", error };
  }
  if (error.includes("archive too large") || /\btoo large\b/i.test(error)) {
    return { status: 400, errorCode: "skill_import_archive_too_large", error };
  }
  if (error.includes("empty archive")) {
    return { status: 400, errorCode: "skill_import_empty_archive", error };
  }
  if (error.includes("Agent skill import needs")) {
    return { status: 500, errorCode: "skill_import_harness_missing", error };
  }
  if (error.includes("No skills found") || error.includes("No SkillEvalator")) {
    return { status: 400, errorCode: "skill_import_no_skills_found", error };
  }
  if (error.includes("path not found in repo")) {
    return { status: 400, errorCode: "skill_import_path_not_found", error };
  }
  if (
    error.includes("zip-slip") ||
    error.includes("symlink") ||
    error.includes("reparse") ||
    error.includes("junction") ||
    error.includes("extract tree too deep") ||
    error.includes("unsupported file type")
  ) {
    return { status: 400, errorCode: "skill_import_unsafe_archive", error };
  }
  if (
    error.startsWith("invalid ") ||
    error === "url required" ||
    error === "invalid URL" ||
    error.includes("https URL") ||
    error.includes("github.com") ||
    error.includes("URL must") ||
    error.includes("URL missing") ||
    error.includes("unsupported GitHub") ||
    error.includes("GitHub repo")
  ) {
    return { status: 400, errorCode: "skill_import_github_url_invalid", error };
  }
  if (
    error.includes("only .zip") ||
    error.includes(".zip") ||
    error.includes("unzip failed") ||
    error.includes("zipPath")
  ) {
    return { status: 400, errorCode: "skill_import_zip_required", error };
  }

  // Unknown core failures stay 500 with generic code (prefer body.error).
  return { status: 500, errorCode: "skill_import_failed", error };
}

/**
 * Map POST /api/skills JSON errorCodes to shared Find/Receive copy
 * (fail-closed when error field is missing). Used by NewRunForm.
 */
export function resolveSkillImportPostError(
  body: SkillImportPostErrorBody,
): string {
  const fromBody = body.error?.trim();
  const code = body.errorCode as SkillImportErrorCode | undefined;
  if (code && FAIL_CLOSED[code]) {
    return fromBody || FAIL_CLOSED[code];
  }
  return fromBody || SKILL_IMPORT_FAILED;
}

export function knownSkillImportErrorCodes(): SkillImportErrorCode[] {
  return Object.keys(FAIL_CLOSED) as SkillImportErrorCode[];
}
