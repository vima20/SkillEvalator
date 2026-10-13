import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  decideDockerGradeAbort,
  resolveTrustedScriptsDir,
  toDockerBindPath,
} from "./dockerGrade.js";
import { writeJsonFile } from "./fsJson.js";

const temps: string[] = [];

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("toDockerBindPath", () => {
  it("converts Windows drive paths for Docker Desktop", () => {
    if (process.platform !== "win32") return;
    const out = toDockerBindPath("C:\\Users\\test\\data");
    expect(out.startsWith("/c/")).toBe(true);
    expect(out.includes("\\")).toBe(false);
  });

  it("keeps posix absolute paths", () => {
    if (process.platform === "win32") return;
    expect(toDockerBindPath("/tmp/se-grade")).toBe(
      path.resolve("/tmp/se-grade"),
    );
  });
});

describe("decideDockerGradeAbort", () => {
  it("prefers cancel over timeout", () => {
    expect(
      decideDockerGradeAbort({ cancelRequested: true, timedOut: true }),
    ).toBe("cancel");
  });

  it("reports timeout when not cancelled", () => {
    expect(
      decideDockerGradeAbort({ cancelRequested: false, timedOut: true }),
    ).toBe("timeout");
  });

  it("returns null for normal completion", () => {
    expect(
      decideDockerGradeAbort({ cancelRequested: false, timedOut: false }),
    ).toBe(null);
  });
});

describe("resolveTrustedScriptsDir", () => {
  it("pins via tasksets harness.json over readdir order", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-harness-"));
    temps.push(root);
    const evalSkills = path.join(root, "eval-skills");
    const imported = path.join(root, "imported", "imp_skill");

    const writeLocal = (id: string, gradeBody: string) => {
      const dir = path.join(evalSkills, id);
      writeJsonFile(path.join(dir, "fixtures", "manifest.json"), {
        taskSetId: "cde-v1",
        taskSetDir: "cde-v1",
        githubUrl: "https://github.com/acme/x",
        license: "MIT",
        dependencies: [],
        taskIds: ["bug-01"],
        dryRunIds: ["bug-01"],
        targetFile: { "bug-01": "fix.js" },
      });
      fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(dir, "scripts", "grade.js"), gradeBody, "utf8");
    };

    // Lexicographically first would be "aaa-poison" without harness.json.
    writeLocal("aaa-poison", "module.exports = { poison: true };\n");
    writeLocal("code-debugging-eval", "module.exports = { ok: true };\n");
    writeJsonFile(path.join(evalSkills, "tasksets", "cde-v1", "harness.json"), {
      scriptsFromSkillId: "code-debugging-eval",
    });

    writeJsonFile(path.join(imported, "fixtures", "manifest.json"), {
      taskSetId: "cde-v1",
      taskSetDir: "cde-v1",
      githubUrl: "https://github.com/acme/x",
      license: "MIT",
      dependencies: [],
      taskIds: ["bug-01"],
      dryRunIds: ["bug-01"],
      targetFile: { "bug-01": "fix.js" },
    });
    writeJsonFile(path.join(imported, ".import.json"), {
      importId: "imp_skill",
    });
    fs.mkdirSync(path.join(imported, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(imported, "scripts", "grade.js"),
      "throw new Error('imported');\n",
      "utf8",
    );

    const pinned = resolveTrustedScriptsDir(imported);
    expect(pinned.pinned).toBe(true);
    expect(pinned.scriptsDir).toBe(
      path.join(evalSkills, "code-debugging-eval", "scripts"),
    );
    expect(pinned.gradeHash).toBe(
      crypto
        .createHash("sha256")
        .update("module.exports = { ok: true };\n")
        .digest("hex"),
    );
  });

  it("fail-closes when multiple skills share taskSetId without harness.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-harness-multi-"));
    temps.push(root);
    const evalSkills = path.join(root, "eval-skills");
    const imported = path.join(root, "imported", "imp_skill");
    const gradeBody = "module.exports = { ok: true };\n";

    const writeLocal = (id: string) => {
      const dir = path.join(evalSkills, id);
      writeJsonFile(path.join(dir, "fixtures", "manifest.json"), {
        taskSetId: "cde-v1",
        taskSetDir: "cde-v1",
        githubUrl: "https://github.com/acme/x",
        license: "MIT",
        dependencies: [],
        taskIds: ["bug-01"],
        dryRunIds: ["bug-01"],
        targetFile: { "bug-01": "fix.js" },
      });
      fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
      fs.writeFileSync(path.join(dir, "scripts", "grade.js"), gradeBody, "utf8");
    };

    writeLocal("aaa-twin");
    writeLocal("bbb-twin");
    // No harness.json — identical grade.js must still fail closed.

    writeJsonFile(path.join(imported, "fixtures", "manifest.json"), {
      taskSetId: "cde-v1",
      taskSetDir: "cde-v1",
      githubUrl: "https://github.com/acme/x",
      license: "MIT",
      dependencies: [],
      taskIds: ["bug-01"],
      dryRunIds: ["bug-01"],
      targetFile: { "bug-01": "fix.js" },
    });
    writeJsonFile(path.join(imported, ".import.json"), {
      importId: "imp_skill",
    });

    expect(() => resolveTrustedScriptsDir(imported)).toThrow(
      /ambiguous trusted harness[\s\S]*same grade\.js[\s\S]*harness\.json/,
    );
  });

  it("allows a single taskSetId match without harness.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "se-harness-one-"));
    temps.push(root);
    const evalSkills = path.join(root, "eval-skills");
    const imported = path.join(root, "imported", "imp_skill");

    const dir = path.join(evalSkills, "only-skill");
    writeJsonFile(path.join(dir, "fixtures", "manifest.json"), {
      taskSetId: "solo-v1",
      taskSetDir: "solo-v1",
      githubUrl: "https://github.com/acme/x",
      license: "MIT",
      dependencies: [],
      taskIds: ["bug-01"],
      dryRunIds: ["bug-01"],
      targetFile: { "bug-01": "fix.js" },
    });
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scripts", "grade.js"),
      "module.exports = { solo: true };\n",
      "utf8",
    );

    writeJsonFile(path.join(imported, "fixtures", "manifest.json"), {
      taskSetId: "solo-v1",
      taskSetDir: "solo-v1",
      githubUrl: "https://github.com/acme/x",
      license: "MIT",
      dependencies: [],
      taskIds: ["bug-01"],
      dryRunIds: ["bug-01"],
      targetFile: { "bug-01": "fix.js" },
    });
    writeJsonFile(path.join(imported, ".import.json"), {
      importId: "imp_skill",
    });

    const pinned = resolveTrustedScriptsDir(imported);
    expect(pinned.pinned).toBe(true);
    expect(pinned.scriptsDir).toBe(path.join(dir, "scripts"));
    expect(pinned.gradeHash).toBe(
      crypto
        .createHash("sha256")
        .update("module.exports = { solo: true };\n")
        .digest("hex"),
    );
  });
});
