import { describe, expect, it } from "vitest";
import {
  EXPORT_COMPARISON_NOT_READY,
  EXPORT_DOWNLOAD_FAILED_FALLBACK,
  EXPORT_DOWNLOAD_NETWORK_ERROR,
  EXPORT_DOWNLOAD_UNEXPECTED_JSON,
  EXPORT_EVALUATION_META_MISSING,
  EXPORT_FAILED_ERROR,
  EXPORT_INVALID_REQUEST_ERROR,
  EXPORT_RESULT_NOT_FOUND,
  EXPORT_RESULT_NOT_READY,
  comparisonExportProductFromHref,
  exportFailClosedErrorCodes,
  exportGateBlockMessage,
  resolveExportDownloadFetchError,
  resolveExportGetError,
} from "./exportResolve.js";

describe("resolveExportGetError", () => {
  it("fail-closes known codes without body.error", () => {
    expect(
      resolveExportGetError(
        { errorCode: "benefit_export_fake_produce_forbidden" },
        "Download failed (409)",
      ),
    ).toBe("benefit export rejects FAKE_PRODUCE tip legs (not live evidence)");
    expect(
      resolveExportGetError(
        { errorCode: "run_csv_pair_required" },
        "Download failed (409)",
      ),
    ).toMatch(/paired evaluationId/);
    expect(
      resolveExportGetError(
        { errorCode: "comparison_export_not_official" },
        "Download failed (409)",
      ),
    ).toMatch(/comparison CSV export requires mode=official/);
    expect(
      resolveExportGetError(
        { errorCode: "export_result_not_ready" },
        "Download failed (404)",
      ),
    ).toBe(EXPORT_RESULT_NOT_READY);
    expect(
      resolveExportGetError(
        { errorCode: "export_result_not_found" },
        "Download failed (404)",
      ),
    ).toBe(EXPORT_RESULT_NOT_FOUND);
    expect(
      resolveExportGetError(
        { errorCode: "export_comparison_not_ready" },
        "Download failed (404)",
      ),
    ).toBe(EXPORT_COMPARISON_NOT_READY);
    expect(
      resolveExportGetError(
        { errorCode: "export_evaluation_meta_missing" },
        "Download failed (404)",
      ),
    ).toBe(EXPORT_EVALUATION_META_MISSING);
  });

  it("prefers body.error for product-specific comparison copy", () => {
    expect(
      resolveExportGetError(
        {
          errorCode: "comparison_export_smoke_forbidden",
          error:
            "pilot archive download rejects evaluation.smoke=true (fixture plant)",
        },
        "Download failed (409)",
      ),
    ).toMatch(/pilot archive download/);
  });

  it("fail-closes comparison_export_* with archive product when error missing", () => {
    expect(
      resolveExportGetError(
        { errorCode: "comparison_export_smoke_forbidden" },
        "Download failed (409)",
        { comparisonProduct: "pilot archive download" },
      ),
    ).toBe(
      "pilot archive download rejects evaluation.smoke=true (fixture plant)",
    );
    expect(
      resolveExportGetError(
        { errorCode: "comparison_export_not_official" },
        "Download failed (409)",
        { comparisonProduct: "pilot archive download" },
      ),
    ).toMatch(/^pilot archive download requires mode=official/);
  });

  it("comparisonExportProductFromHref distinguishes archive vs csv", () => {
    expect(
      comparisonExportProductFromHref("/api/comparison/e1/archive"),
    ).toBe("pilot archive download");
    expect(
      comparisonExportProductFromHref("/api/comparison/e1/archive?x=1"),
    ).toBe("pilot archive download");
    expect(comparisonExportProductFromHref("/api/comparison/e1/csv")).toBe(
      "comparison CSV export",
    );
  });

  it("falls back to status message for unknown codes", () => {
    expect(
      resolveExportGetError({ errorCode: "unknown_export" }, "Download failed (409)"),
    ).toBe("Download failed (409)");
    expect(resolveExportGetError({}, "Download failed (500)")).toBe(
      "Download failed (500)",
    );
  });

  it("covers all gate errorCodes used by adoption exports", () => {
    const codes = exportFailClosedErrorCodes();
    expect(codes).toContain("benefit_export_not_attested");
    expect(codes).toContain("comparison_export_not_attested");
    expect(codes).toContain("run_csv_not_attested");
    expect(codes).toContain("export_result_not_ready");
    expect(codes).toContain("export_failed");
    expect(codes).toContain("export_invalid_request");
  });

  it("fail-closes export catch codes without body.error", () => {
    expect(
      resolveExportGetError(
        { errorCode: "export_failed" },
        "Download failed (500)",
      ),
    ).toBe(EXPORT_FAILED_ERROR);
    expect(
      resolveExportGetError(
        { errorCode: "export_invalid_request" },
        "Download failed (400)",
      ),
    ).toBe(EXPORT_INVALID_REQUEST_ERROR);
  });

  it("exportGateBlockMessage matches download fail-closed path", () => {
    expect(
      exportGateBlockMessage({
        errorCode: "benefit_export_provisional_pass",
      }),
    ).toMatch(/provisional official PASS/i);
    expect(
      exportGateBlockMessage({
        errorCode: "benefit_export_comparison_pass_required",
      }),
    ).toBe(
      resolveExportGetError(
        { errorCode: "benefit_export_comparison_pass_required" },
        "Adoption export locked",
      ),
    );
    expect(
      exportGateBlockMessage({
        errorCode: "run_csv_pair_required",
        error: "run CSV export requires paired evaluationId (baseline↔candidate)",
      }),
    ).toMatch(/paired evaluationId/);
  });

  it("SSR surfaces use exportGateBlockMessage", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    const runCsvAllowed = fs.readFileSync(
      path.join(cwd, "src/lib/runCsvExportAllowed.ts"),
      "utf8",
    );
    expect(runCsvAllowed).toMatch(/runCsvExportGateFromPacked/);
    expect(
      fs.readFileSync(
        path.join(cwd, "src/lib/runDetailEvaluationPack.ts"),
        "utf8",
      ),
    ).toMatch(/runCsvExportGateFromPacked/);
    for (const rel of [
      "src/app/benefit/[runId]/page.tsx",
      "src/app/comparison/[evaluationId]/page.tsx",
      "src/app/comparison/page.tsx",
    ]) {
      const src = fs.readFileSync(path.join(cwd, rel), "utf8");
      expect(src).toMatch(/exportGateBlockMessage/);
    }
    expect(
      fs.readFileSync(
        path.join(cwd, "src/app/benefit/[runId]/BenefitActions.tsx"),
        "utf8",
      ),
    ).toMatch(/EXPORT_BENEFIT_LOCKED_FALLBACK/);
    expect(
      fs.readFileSync(
        path.join(cwd, "src/app/runs/[runId]/RunDetailClient.tsx"),
        "utf8",
      ),
    ).toMatch(/EXPORT_RUN_CSV_LOCKED_FALLBACK/);
  });

  it("resolveExportDownloadFetchError maps client-only download failures", () => {
    expect(resolveExportDownloadFetchError("network")).toBe(
      EXPORT_DOWNLOAD_NETWORK_ERROR,
    );
    expect(resolveExportDownloadFetchError("unexpected_json")).toBe(
      EXPORT_DOWNLOAD_UNEXPECTED_JSON,
    );
    expect(resolveExportDownloadFetchError("http", 409)).toBe(
      "Download failed (409)",
    );
    expect(resolveExportDownloadFetchError("failed")).toBe(
      EXPORT_DOWNLOAD_FAILED_FALLBACK,
    );
  });

  it("export GET routes attach 404 and catch errorCodes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const cwd = process.cwd();
    for (const rel of [
      "src/app/api/runs/[runId]/csv/route.ts",
      "src/app/api/runs/[runId]/benefit/route.ts",
      "src/app/api/comparison/[evaluationId]/csv/route.ts",
      "src/app/api/comparison/[evaluationId]/archive/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(cwd, rel), "utf8");
      expect(src).toMatch(/errorCode:/);
      expect(src).toMatch(/export_invalid_request/);
      expect(src).toMatch(/export_failed/);
      expect(src).toMatch(/EXPORT_FAILED_ERROR/);
    }
    const runCsv = fs.readFileSync(
      path.join(cwd, "src/app/api/runs/[runId]/csv/route.ts"),
      "utf8",
    );
    expect(runCsv).toMatch(/export_result_not_ready/);
    expect(runCsv).toMatch(/runCsvExportGateForRun/);
    const benefit = fs.readFileSync(
      path.join(cwd, "src/app/api/runs/[runId]/benefit/route.ts"),
      "utf8",
    );
    expect(benefit).toMatch(/export_result_not_found/);
    const cmp = fs.readFileSync(
      path.join(cwd, "src/app/api/comparison/[evaluationId]/csv/route.ts"),
      "utf8",
    );
    expect(cmp).toMatch(/export_evaluation_meta_missing/);
    expect(cmp).toMatch(/export_comparison_not_ready/);
    expect(cmp).toMatch(/comparisonExportContextFromPacked/);
    const archive = fs.readFileSync(
      path.join(cwd, "src/app/api/comparison/[evaluationId]/archive/route.ts"),
      "utf8",
    );
    expect(archive).toMatch(/comparisonExportContextFromPacked/);
    expect(benefit).toMatch(/benefitExportContextFromPacked/);
  });
});
