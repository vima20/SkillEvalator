import { describe, expect, it } from "vitest";
import {
  captureEnvEvidenceKind,
  formatCaptureEnvEvidence,
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
});
