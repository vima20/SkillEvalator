import { describe, expect, it } from "vitest";
import {
  captureEnvEvidenceKind,
  formatCaptureEnvEvidence,
  formatCaptureEnvSnapshot,
  formatCaptureGradePolicy,
} from "./captureEnvEvidence.js";

describe("captureEnvEvidence", () => {
  it("classifies smoke, live attested, and missing attestation", () => {
    expect(
      captureEnvEvidenceKind({
        fakeProduce: true,
        produceAttested: true,
      }),
    ).toBe("smoke");
    expect(
      captureEnvEvidenceKind({
        fakeProduce: false,
        produceAttested: true,
      }),
    ).toBe("live_attested");
    expect(captureEnvEvidenceKind({ produceAttested: false })).toBe(
      "not_attested",
    );
    expect(captureEnvEvidenceKind({})).toBe("not_attested");
  });

  it("formats labels without implying live when attestation is missing", () => {
    expect(
      formatCaptureEnvEvidence({ produceAttested: true }),
    ).toMatch(/Live produce attested/i);
    expect(formatCaptureEnvEvidence({})).toMatch(/Not attested/i);
    expect(
      formatCaptureEnvEvidence({ fakeProduce: true }),
    ).toMatch(/FAKE_PRODUCE/i);
  });

  it("formats grade policy and env snapshot with allowHostGrade", () => {
    expect(
      formatCaptureGradePolicy({
        grade: "docker_script",
        allowHostGrade: false,
      }),
    ).toMatch(/official pin/i);
    expect(
      formatCaptureGradePolicy({
        grade: "host_script",
        allowHostGrade: true,
      }),
    ).toMatch(/host grade allowed/i);
    expect(formatCaptureGradePolicy({ grade: "docker_script" })).toMatch(
      /not pinned/i,
    );
    expect(
      formatCaptureEnvSnapshot({
        temperature: 0,
        seed: 42,
        costCapUsd: 5,
        grade: "docker_script",
        allowHostGrade: false,
      }),
    ).toContain("allowHostGrade=false");
  });
});
