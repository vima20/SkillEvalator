/**
 * Human-readable produce evidence for Capture / Scorecard UI.
 * Official adoption requires produceAttested=true (not merely “not fake”).
 */
export type CaptureEnvEvidenceKind =
  | "smoke"
  | "live_attested"
  | "not_attested"
  | "unknown";

export function captureEnvEvidenceKind(opts: {
  fakeProduce?: boolean;
  produceAttested?: boolean;
}): CaptureEnvEvidenceKind {
  if (opts.fakeProduce === true) return "smoke";
  if (opts.produceAttested === true) return "live_attested";
  if (opts.produceAttested === false) return "not_attested";
  // undefined / missing on older runs — never treat as live attested
  return "not_attested";
}

export function captureEnvEvidenceLabel(
  kind: CaptureEnvEvidenceKind,
): string {
  switch (kind) {
    case "smoke":
      return "FAKE_PRODUCE (smoke — not adoption evidence)";
    case "live_attested":
      return "Live produce attested";
    case "not_attested":
      return "Not attested (no live produce evidence)";
    default:
      return "Unknown";
  }
}

/** Compact label for env snapshot lines. */
export function formatCaptureEnvEvidence(opts: {
  fakeProduce?: boolean;
  produceAttested?: boolean;
}): string {
  return captureEnvEvidenceLabel(captureEnvEvidenceKind(opts));
}
