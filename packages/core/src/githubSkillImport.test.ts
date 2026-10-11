import { describe, expect, it } from "vitest";
import { parseGitHubSkillUrl } from "./githubSkillImport.js";

describe("parseGitHubSkillUrl", () => {
  it("parses owner/repo", () => {
    const r = parseGitHubSkillUrl("vima20/SkillEvalator");
    expect(r.owner).toBe("vima20");
    expect(r.repo).toBe("SkillEvalator");
    expect(r.ref).toBe("main");
    expect(r.subdir).toBe("");
  });

  it("parses owner/repo@ref/path", () => {
    const r = parseGitHubSkillUrl(
      "acme/skills@v1/eval-skills/code-debugging-eval",
    );
    expect(r.ref).toBe("v1");
    expect(r.subdir).toBe("eval-skills/code-debugging-eval");
  });

  it("parses tree URL", () => {
    const r = parseGitHubSkillUrl(
      "https://github.com/vima20/SkillEvalator/tree/main/eval-skills",
    );
    expect(r.owner).toBe("vima20");
    expect(r.subdir).toBe("eval-skills");
    expect(r.ref).toBe("main");
  });

  it("rejects non-github hosts", () => {
    expect(() =>
      parseGitHubSkillUrl("https://gitlab.com/acme/skills"),
    ).toThrow(/github\.com/);
  });

  it("rejects http", () => {
    expect(() =>
      parseGitHubSkillUrl("http://github.com/acme/skills"),
    ).toThrow(/https/);
  });
});
