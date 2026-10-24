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
    expect(
      exportErrorFromJsonBody(
        { errorCode: "comparison_export_not_attested" },
        "Download failed (409)",
        { comparisonProduct: "pilot archive download" },
      ),
    ).toMatch(/^pilot archive download requires produceAttested/);
  });

  it("appends pilot mode metadata from 409 JSON bodies", () => {
    expect(
      exportErrorFromJsonBody(
        {
          errorCode: "run_csv_comparison_not_official",
          mode: "dry-run",
          adoptionMode: "official",
          comparisonJsonMode: "dry-run",
        },
        "Download failed (409)",
      ),
    ).toBe(
      "run CSV export requires official Comparison mode — tip adoption mode: official; comparison.json on disk: dry-run",
    );
    expect(
      exportErrorFromJsonBody(
        {
          error: "benefit export requires mode=official",
          comparisonMode: "official",
          comparisonJsonMode: "dry-run",
        },
      ),
    ).toBe(
      "benefit export requires mode=official — tip adoption mode: official; comparison.json on disk: dry-run",
    );
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
    expect(src).toMatch(/comparisonExportProductFromHref/);
    expect(src).toMatch(/tryResolveAuthApiError/);
    expect(src).toMatch(/resolveExportDownloadFetchError/);
    expect(src).toMatch(/res\.blob\(\)/);
    expect(src).toMatch(/resolveExportDownloadFetchError\("failed"\)/);
    expect(src).not.toMatch(/Download failed — network error/);
    expect(src).not.toMatch(
      /Unexpected JSON response \(export locked or unauthorized\)/,
    );
  });
});
