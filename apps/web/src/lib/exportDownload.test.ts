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

  it("fail-closes errorCode-only bodies via resolveExportGetError", () => {
    expect(
      exportErrorFromJsonBody(
        { errorCode: "benefit_export_fake_produce_forbidden" },
        "Download failed (409)",
      ),
    ).toBe("benefit export rejects FAKE_PRODUCE tip legs (not live evidence)");
    expect(
      exportErrorFromJsonBody(
        { errorCode: "export_result_not_ready" },
        "Download failed (404)",
      ),
    ).toBe("result not ready");
  });

  it("downloadExport uses exportErrorFromJsonBody", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/exportDownload.ts"),
      "utf8",
    );
    expect(src).toMatch(/resolveExportGetError/);
    expect(src).toMatch(/exportErrorFromJsonBody\(body,/);
  });
});
