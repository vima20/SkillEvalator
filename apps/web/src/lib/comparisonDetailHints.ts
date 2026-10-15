/**
 * Comparison detail banners for smoke / mixed harness pairs that Clear smoke
 * noise leaves on disk (export gates already refuse CSV / archive).
 */
export type ComparisonHarnessHint =
  | { kind: "none" }
  | { kind: "both_smoke" }
  | { kind: "both_unattested" }
  | {
      kind: "mixed";
      smokeRole: "baseline" | "candidate" | "both_flags";
      liveRole: "baseline" | "candidate" | null;
    }
  | { kind: "eval_smoke_with_live" };

export function comparisonHarnessHint(opts: {
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
}): ComparisonHarnessHint {
  const baseFake = opts.baselineFakeProduce === true;
  const candFake = opts.candidateFakeProduce === true;
  const metaSmoke = opts.metaSmoke === true;
  const baseLive =
    !baseFake && opts.baselineProduceAttested === true;
  const candLive =
    !candFake && opts.candidateProduceAttested === true;

  if (baseFake && candFake) return { kind: "both_smoke" };

  if (baseFake !== candFake) {
    return {
      kind: "mixed",
      smokeRole: baseFake ? "baseline" : "candidate",
      liveRole: baseFake ? "candidate" : "baseline",
    };
  }

  // evaluation.smoke plant kept with at least one live attested tip leg
  if (metaSmoke && (baseLive || candLive)) {
    return { kind: "eval_smoke_with_live" };
  }

  // meta.smoke alone (both tips fake already handled; both non-fake plant)
  if (metaSmoke && !baseFake && !candFake) {
    return {
      kind: "mixed",
      smokeRole: "both_flags",
      liveRole: null,
    };
  }

  // Non-FAKE fixture plants missing produceAttested on both tips
  if (!baseFake && !candFake && !baseLive && !candLive) {
    return { kind: "both_unattested" };
  }

  return { kind: "none" };
}
