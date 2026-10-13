import { describe, expect, it } from "vitest";
import {
  evaluationIdFromSources,
  resolveRetryRole,
  roleFromJobRaw,
} from "./retryRole.js";

describe("roleFromJobRaw", () => {
  it("reads explicit baseline/candidate only", () => {
    expect(roleFromJobRaw({ role: "baseline" })).toBe("baseline");
    expect(roleFromJobRaw({ role: "candidate" })).toBe("candidate");
    expect(roleFromJobRaw({ role: "other" })).toBeUndefined();
    expect(roleFromJobRaw({})).toBeUndefined();
    expect(roleFromJobRaw(null)).toBeUndefined();
  });
});

describe("resolveRetryRole", () => {
  it("prefers status over result over explicit job", () => {
    expect(
      resolveRetryRole({
        statusRole: "baseline",
        resultRole: "candidate",
        jobRoleExplicit: "candidate",
      }),
    ).toBe("baseline");
    expect(
      resolveRetryRole({
        statusRole: null,
        resultRole: "baseline",
        jobRoleExplicit: "candidate",
      }),
    ).toBe("baseline");
    expect(
      resolveRetryRole({
        statusRole: null,
        resultRole: null,
        jobRoleExplicit: "baseline",
      }),
    ).toBe("baseline");
  });

  it("defaults to candidate only when nothing explicit exists", () => {
    expect(
      resolveRetryRole({
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
        statusEvaluationId: "eval_status",
        jobEvaluationId: "eval_job",
        resultEvaluationId: "eval_result",
      }),
    ).toBe("eval_status");
    expect(
      evaluationIdFromSources({
        statusEvaluationId: "  ",
        jobEvaluationId: "eval_job",
        resultEvaluationId: "eval_result",
      }),
    ).toBe("eval_job");
  });
});
