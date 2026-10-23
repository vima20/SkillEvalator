import type {
  AdoptionConfirmation,
  ComparisonVerdict,
  RunResult,
} from "@skillevalator/core";
import { isAdoptionConfirmationPending } from "@/lib/comparisonVerdictDisplay";
import {
  pairExportEvidenceFromBrowse,
  pilotArchiveAdoptionFromPacked,
  type EvaluationPairBrowseEntry,
  type PackedEvaluationBrowse,
} from "@/lib/evaluationPairBrowse";
import { pairedEvaluationAdoptionMode } from "@/lib/pairedAdoptionMode";

/**
 * Per-run CSV can look like pilot evidence. Require official paired Comparison
 * PASS/FAIL on a current meta leg (same adoption bar as Comparison CSV) and
 * refuse smoke / superseded retries.
 */
export function runCsvExportGate(opts: {
  result: {
    runId?: string;
    mode: RunResult["mode"];
    evaluationId?: string;
    status?: RunResult["status"];
    capture?: { env?: { fakeProduce?: boolean; produceAttested?: boolean } };
  };
  /**
   * Resolved evaluationId (status → job → result). When set, overrides
   * result.evaluationId for the pair-required check.
   */
  evaluationId?: string | null;
  comparisonVerdict?: ComparisonVerdict | null;
  comparisonMode?: RunResult["mode"] | null;
  comparisonAdoptionConfirmation?: AdoptionConfirmation | null;
  baselineRunId?: string | null;
  candidateRunId?: string | null;
  /** Same evidence bar as Comparison CSV / pilot archive. */
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
  metaMode?: string | null;
  baselineMode?: RunResult["mode"];
  candidateMode?: RunResult["mode"];
}):
  | { ok: true }
  | { ok: false; status: 409; error: string; errorCode: string } {
  if (opts.metaSmoke === true) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_eval_smoke_forbidden",
      error:
        "run CSV export rejects evaluation.smoke=true (fixture plant)",
    };
  }
  if (
    opts.result.capture?.env?.fakeProduce === true ||
    opts.baselineFakeProduce === true ||
    opts.candidateFakeProduce === true
  ) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_smoke_forbidden",
      error:
        "run CSV export blocked while FAKE_PRODUCE smoke harness was used",
    };
  }
  if (opts.result.mode !== "official") {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_official_required",
      error: "run CSV export requires mode=official (dry-run is not adoption evidence)",
    };
  }
  const evaluationId =
    opts.evaluationId?.trim() || opts.result.evaluationId?.trim() || "";
  if (!evaluationId) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_pair_required",
      error:
        "run CSV export requires paired evaluationId (baseline↔candidate)",
    };
  }
  const comparisonAdoptionMode =
    pairedEvaluationAdoptionMode({
      comparisonMode: opts.comparisonMode ?? undefined,
      metaMode: opts.metaMode,
      baselineMode: opts.baselineMode,
      candidateMode: opts.candidateMode,
    }) ?? opts.comparisonMode;
  if (comparisonAdoptionMode !== "official") {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_comparison_not_official",
      error: "run CSV export requires official Comparison mode",
    };
  }
  const v = opts.comparisonVerdict;
  if (v !== "PASS" && v !== "FAIL") {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_comparison_not_decisive",
      error:
        "run CSV export requires Comparison PASS or FAIL (not INCONCLUSIVE / not ready)",
    };
  }
  const confirm = opts.comparisonAdoptionConfirmation;
  if (
    v === "PASS" &&
    isAdoptionConfirmationPending(confirm)
  ) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_provisional_pass",
      error:
        `run CSV export locked — provisional official PASS ${confirm!.step}/${confirm!.required}; confirm with a second independent official pair`,
    };
  }
  const runId = opts.result.runId?.trim();
  const legs = [opts.baselineRunId, opts.candidateRunId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (!runId || legs.length < 2 || !legs.includes(runId)) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_not_meta_leg",
      error:
        "run CSV export requires this runId to be a current Comparison meta leg",
    };
  }
  if (
    opts.result.capture?.env?.produceAttested !== true ||
    opts.baselineProduceAttested !== true ||
    opts.candidateProduceAttested !== true
  ) {
    return {
      ok: false,
      status: 409,
      errorCode: "run_csv_not_attested",
      error:
        "run CSV export requires produceAttested=true on this run and both tip legs",
    };
  }
  return { ok: true };
}

/** Run CSV gate from an already-loaded evaluation pack (one pair browse). */
export function runCsvExportGateFromPacked(opts: {
  result: RunResult;
  evaluationId: string | null;
  packed: PackedEvaluationBrowse | null;
  pairBrowse: EvaluationPairBrowseEntry | null;
}):
  | { ok: true }
  | { ok: false; status: 409; error: string; errorCode: string } {
  return runCsvExportGate({
    result: opts.result,
    evaluationId: opts.evaluationId,
    comparisonVerdict: opts.packed?.comparison?.verdict ?? null,
    comparisonMode:
      opts.packed?.comparison
        ? pilotArchiveAdoptionFromPacked(opts.packed).adoptionMode
        : null,
    comparisonAdoptionConfirmation:
      opts.packed?.comparison?.adoptionConfirmation ?? null,
    baselineRunId: opts.pairBrowse?.tipBaselineRunId ?? null,
    candidateRunId: opts.pairBrowse?.tipCandidateRunId ?? null,
    ...(opts.pairBrowse ? pairExportEvidenceFromBrowse(opts.pairBrowse) : {}),
  });
}
