import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadSkill, taskPaths } from "@skillevalator/core";
import { importedSkillsDir, skillsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

const MAX_FILE_CHARS = 256_000;
const FilenameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const UpdateSchema = z.object({
  skillId: z.string().min(1).max(160),
  skillMd: z.string().max(MAX_FILE_CHARS),
  gradeScript: z.string().max(MAX_FILE_CHARS).nullable(),
  tasks: z.array(
    z.object({
      taskId: z.string().min(1).max(160),
      tests: z.array(
        z.object({
          filename: FilenameSchema,
          content: z.string().max(MAX_FILE_CHARS),
        }),
      ),
      expected: z.string().max(MAX_FILE_CHARS).nullable(),
    }),
  ),
});

function skillFor(id: string) {
  return loadSkill([skillsDir(), importedSkillsDir()], id);
}

function readText(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Editable skill files must be regular files");
  }
  if (stat.size > MAX_FILE_CHARS * 4) {
    throw new Error("Editable skill file is too large");
  }
  return fs.readFileSync(file, "utf8");
}

function writeText(file: string, content: string) {
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("Editable skill files must be regular files");
    }
  }
  fs.writeFileSync(file, content, { encoding: "utf8", flag: "w" });
}

function editorDocument(skillId: string) {
  const skill = skillFor(skillId);
  const scriptsDir = path.join(skill.root, "scripts");
  if (fs.existsSync(scriptsDir)) {
    const stat = fs.lstatSync(scriptsDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error("Skill scripts directory must be a real directory");
    }
  }
  const tasks = skill.manifest.taskIds.map((taskId) => {
    const paths = taskPaths(skill, taskId);
    const tests = fs.existsSync(paths.testsDir)
      ? fs
          .readdirSync(paths.testsDir)
          .sort()
          .map((filename) => {
            if (!FilenameSchema.safeParse(filename).success) return null;
            const file = path.join(paths.testsDir, filename);
            const content = readText(file);
            return content === null ? null : { filename, content };
          })
          .filter((entry): entry is { filename: string; content: string } =>
            entry !== null,
          )
      : [];
    return {
      taskId,
      targetFile: paths.targetFile,
      tests,
      expected: readText(paths.expectedPath),
    };
  });
  return {
    skillId: skill.id,
    skillMd: skill.skillMd,
    gradeScript: fs.existsSync(scriptsDir)
      ? readText(path.join(scriptsDir, "grade.js"))
      : null,
    taskSetId: skill.manifest.taskSetId,
    sharedTaskSet: Boolean(skill.manifest.taskSetDir),
    tasks,
  };
}

export async function GET(req: Request) {
  const skillId = new URL(req.url).searchParams.get("skillId") ?? "";
  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(editorDocument(skillId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load skill" },
      { status: 400 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = UpdateSchema.parse(await req.json());
    const skill = skillFor(body.skillId);
    const scriptsDir = path.join(skill.root, "scripts");
    if (fs.existsSync(scriptsDir)) {
      const stat = fs.lstatSync(scriptsDir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error("Skill scripts directory must be a real directory");
      }
    }
    const gradeScriptPath = path.join(scriptsDir, "grade.js");
    const currentGradeScript = fs.existsSync(scriptsDir)
      ? readText(gradeScriptPath)
      : null;
    if ((currentGradeScript === null) !== (body.gradeScript === null)) {
      return NextResponse.json({ error: "Grader file changed; reload the editor" }, { status: 409 });
    }
    if (body.tasks.length !== skill.manifest.taskIds.length) {
      return NextResponse.json({ error: "Task list changed; reload the editor" }, { status: 409 });
    }

    // Validate all task IDs and filenames before writing any editor contents.
    const writes: Array<{ file: string; content: string }> = [];
    const seenTasks = new Set<string>();
    for (const task of body.tasks) {
      if (!skill.manifest.taskIds.includes(task.taskId) || seenTasks.has(task.taskId)) {
        return NextResponse.json({ error: "Invalid or duplicate task ID" }, { status: 400 });
      }
      seenTasks.add(task.taskId);
      const paths = taskPaths(skill, task.taskId);
      const currentTests = fs.existsSync(paths.testsDir)
        ? fs.readdirSync(paths.testsDir).filter((name) => {
            if (!FilenameSchema.safeParse(name).success) return false;
            const file = path.join(paths.testsDir, name);
            const stat = fs.lstatSync(file);
            return stat.isFile() && !stat.isSymbolicLink();
          })
        : [];
      const submittedNames = task.tests.map((test) => test.filename).sort();
      if (
        submittedNames.length !== currentTests.length ||
        submittedNames.some((name, index) => name !== [...currentTests].sort()[index])
      ) {
        return NextResponse.json({ error: "Test files changed; reload the editor" }, { status: 409 });
      }
      const currentExpected = readText(paths.expectedPath);
      if ((currentExpected === null) !== (task.expected === null)) {
        return NextResponse.json({ error: "Golden files changed; reload the editor" }, { status: 409 });
      }
      for (const test of task.tests) {
        writes.push({ file: path.join(paths.testsDir, test.filename), content: test.content });
      }
      if (task.expected !== null) {
        writes.push({ file: paths.expectedPath, content: task.expected });
      }
    }

    const skillMdPath = path.join(skill.root, "SKILL.md");
    writes.unshift({ file: skillMdPath, content: body.skillMd });
    if (body.gradeScript !== null) {
      writes.push({ file: gradeScriptPath, content: body.gradeScript });
    }
    for (const write of writes) writeText(write.file, write.content);
    return NextResponse.json({ ok: true, document: editorDocument(skill.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save skill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
