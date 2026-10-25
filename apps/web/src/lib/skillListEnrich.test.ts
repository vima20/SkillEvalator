import { describe, expect, it } from "vitest";
import { enrichSkillsWithImportMeta } from "./skillListEnrich.js";

describe("enrichSkillsWithImportMeta", () => {
  it("passes through bundled skills unchanged", () => {
    const out = enrichSkillsWithImportMeta([
      {
        id: "code-debugging-eval",
        githubUrl: "https://github.com/acme/x",
        taskSetId: "cde-v1",
        dryRunCount: 3,
        taskCount: 8,
        license: "MIT",
        dependencies: [],
      },
    ]);
    expect(out[0]?.wrappedFromAgentSkill).toBeUndefined();
  });
});
