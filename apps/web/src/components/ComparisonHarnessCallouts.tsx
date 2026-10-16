import Link from "next/link";
import {
  comparisonHarnessHint,
  type ComparisonHarnessHint,
} from "@/lib/comparisonDetailHints";
import { withPilotFocus } from "@/lib/pilotFocusHref";

export function ComparisonHarnessCallouts(opts: {
  metaSmoke?: boolean;
  baselineFakeProduce?: boolean;
  candidateFakeProduce?: boolean;
  baselineProduceAttested?: boolean;
  candidateProduceAttested?: boolean;
  baselineRunId: string;
  candidateRunId: string;
  pilotFocus?: boolean;
}): React.ReactNode {
  const hint = comparisonHarnessHint(opts);
  return renderHarnessCallouts(
    hint,
    opts.baselineRunId,
    opts.candidateRunId,
    opts.pilotFocus === true,
  );
}

export function renderHarnessCallouts(
  hint: ComparisonHarnessHint,
  baselineRunId: string,
  candidateRunId: string,
  pilotFocus = false,
): React.ReactNode {
  if (hint.kind === "none") return null;

  if (hint.kind === "both_smoke") {
    return (
      <div className="panel callout-warn">
        <strong>Smoke harness only</strong>
        <p>
          Both tip legs used FAKE_PRODUCE — not live adoption evidence. CSV /
          pilot archive / Benefit export stay locked (same evidence bar). Clear
          smoke noise can remove the plant when safe.
        </p>
      </div>
    );
  }

  if (hint.kind === "both_unattested") {
    return (
      <div className="panel callout-warn">
        <strong>Not produce-attested</strong>
        <p>
          Tip legs are missing <code>produceAttested=true</code> (fixture /
          plant — not live worker evidence). CSV / pilot archive / Benefit
          export stay locked. Official Comparison also stays INCONCLUSIVE.
        </p>
      </div>
    );
  }

  if (hint.kind === "one_unattested") {
    return (
      <div className="panel callout-warn">
        <strong>Mixed attestation</strong>
        <p>
          The {hint.unattestedRole} tip is missing{" "}
          <code>produceAttested=true</code> while the other tip is live. CSV /
          pilot archive / Benefit export stay locked. Inspect{" "}
          <Link href={withPilotFocus(`/runs/${baselineRunId}`, pilotFocus)}>
            baseline
          </Link>{" "}
          and{" "}
          <Link href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}>
            candidate
          </Link>
          .
        </p>
      </div>
    );
  }

  if (hint.kind === "mixed") {
    return (
      <div className="panel callout-warn">
        <strong>Mixed smoke + live pair</strong>
        <p>
          {hint.smokeRole === "both_flags"
            ? "This evaluation is marked smoke while tip legs look live — Clear smoke noise leaves mixed pairs on disk."
            : `The ${hint.smokeRole} tip used FAKE_PRODUCE while the ${hint.liveRole} tip is live.`}{" "}
          Do not hand off as adoption evidence. Comparison CSV / pilot archive /
          Benefit export stay locked. Inspect{" "}
          <Link href={withPilotFocus(`/runs/${baselineRunId}`, pilotFocus)}>
            baseline
          </Link>{" "}
          and{" "}
          <Link href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}>
            candidate
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="panel callout-warn">
      <strong>Smoke evaluation kept with live tip</strong>
      <p>
        <code>evaluation.smoke</code> is set but at least one tip leg is
        produce-attested live. Clear smoke noise does not half-delete mixed
        pairs — do not treat this as pilot handoff. CSV / archive / Benefit
        export stay locked. Inspect{" "}
        <Link href={withPilotFocus(`/runs/${baselineRunId}`, pilotFocus)}>
          baseline
        </Link>{" "}
        and{" "}
        <Link href={withPilotFocus(`/runs/${candidateRunId}`, pilotFocus)}>
          candidate
        </Link>
        .
      </p>
    </div>
  );
}
