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

/**
 * Official Comparison requires grade=docker_script and allowHostGrade=false.
 * Missing allowHostGrade is not the same as false (older / incomplete captures).
 */
export function formatCaptureGradePolicy(opts: {
  grade?: string;
  allowHostGrade?: boolean;
}): string {
  const grade = opts.grade?.trim() || "—";
  if (opts.allowHostGrade === true) {
    return `${grade} · host grade allowed (not official adoption)`;
  }
  if (
    opts.allowHostGrade === false &&
    opts.grade === "docker_script"
  ) {
    return "docker_script · allowHostGrade=false (official pin)";
  }
  if (opts.allowHostGrade === false) {
    return `${grade} · allowHostGrade=false`;
  }
  return `${grade} · allowHostGrade not pinned`;
}

/** Decoding + cost + grade line for Capture env snapshot. */
export function formatCaptureEnvSnapshot(opts: {
  temperature?: number;
  seed?: number;
  costCapUsd?: number;
  grade?: string;
  allowHostGrade?: boolean;
}): string {
  const host =
    opts.allowHostGrade === true
      ? "allowHostGrade=true"
      : opts.allowHostGrade === false
        ? "allowHostGrade=false"
        : "allowHostGrade=?";
  return `temp=${opts.temperature}, seed=${opts.seed}, cap=$${opts.costCapUsd}, grade=${opts.grade ?? "—"}, ${host}`;
}
