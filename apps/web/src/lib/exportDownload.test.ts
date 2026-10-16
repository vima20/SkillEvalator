import { describe, expect, it } from "vitest";
import {
  exportErrorFromJsonBody,
  parseContentDispositionFilename,
} from "./exportDownload.js";

describe("parseContentDispositionFilename", () => {
  it("parses quoted filename and RFC 5987 filename*", () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="run_1-benefit.csv"',
      ),
    ).toBe("run_1-benefit.csv");
    expect(
      parseContentDispositionFilename(
        "attachment; filename*=UTF-8''eval%2Fpilot.zip",
      ),
    ).toBe("eval/pilot.zip");
  });
});

describe("exportErrorFromJsonBody", () => {
  it("reads API error strings", () => {
    expect(
      exportErrorFromJsonBody({
        error: "benefit export rejects FAKE_PRODUCE tip legs",
        errorCode: "benefit_export_fake_produce_forbidden",
      }),
    ).toBe("benefit export rejects FAKE_PRODUCE tip legs");
    expect(exportErrorFromJsonBody({ ok: true })).toBeNull();
  });
});
