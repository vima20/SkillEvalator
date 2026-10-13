import { describe, expect, it } from "vitest";
import {
  evaluationIdFromSources,
  resolveEvalRole,
  roleFromJobRaw,
} from "./evalRole.js";

describe("roleFromJobRaw", () => {
  it("reads explicit baseline/candidate only", () => {
    expect(roleFromJobRaw({ role: "baseline" })).toBe("baseline");
    expect(roleFromJobRaw({ role: "candidate" })).toBe("candidate");
    expect(roleFromJobRaw({ role: "other" })).toBeUndefined();
    expect(roleFromJobRaw({})).toBeUndefined();
  });
});

describe("resolveEvalRole", () => {
  it("prefers status over result over explicit job", () => {
    expect(
      resolveEvalRole({
        statusRole: "baseline",
        resultRole: "candidate",
        jobRoleExplicit: "candidate",
      }),
    ).toBe("baseline");
    expect(
      resolveEvalRole({
        statusRole: null,
        resultRole: null,
        jobRoleExplicit: null,
      }),
    ).toBe("candidate");
  });
});

describe("evaluationIdFromSources", () => {
  it("prefers status then job then result", () => {
    expect(
      evaluationIdFromSources({
        statusEvaluationId: "eval_s",
        jobEvaluationId: "eval_j",
        resultEvaluationId: "eval_r",
      }),
    ).toBe("eval_s");
  });
});
