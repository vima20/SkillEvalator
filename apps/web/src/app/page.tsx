import Link from "next/link";
import { listSkills } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { skillsDirs } from "@/lib/paths";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";
import { NewRunForm } from "./NewRunForm";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);
  const skills = listSkills(skillsDirs());

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Evaluation pipeline</p>
          <h1>New evaluation run</h1>
          <p>
            Unikie Contribution Evaluator: baseline (neutral prompt) vs
            candidate (skill SKILL.md), then Docker grade. Dry-run uses{" "}
            <code>gpt-4o-mini</code>; official uses <code>gpt-4.1-mini</code>{" "}
            (≥3 repeats). Live official pins <code>produceAttested</code>;{" "}
            <code>FAKE_PRODUCE</code> / fixture plants are not adoption
            evidence.
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle pathname="/" pilotFocus={pilotFocus} />
        </div>
      </header>

      <div className="panel callout-info">
        <strong>Live official pilot</strong>
        <p>
          Confirm{" "}
          <Link href={withPilotFocus("/settings", pilotFocus)}>Settings</Link>{" "}
          is <strong>Ready</strong> (preflight green, no smoke flags) before
          official enqueue. Ready ≠ Comparison PASS / Benefit USE — see{" "}
          <a
            href="https://github.com/vima20/SkillEvalator/blob/main/docs/PILOT-CHECKLIST.md"
            target="_blank"
            rel="noreferrer"
          >
            PILOT-CHECKLIST.md
          </a>
          .
        </p>
      </div>

      {skills.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No eval skills found"
            body="Add a skill under eval-skills/ with fixtures/manifest.json, then refresh this page."
            actionHref="https://github.com/vima20/SkillEvalator/tree/main/eval-skills"
            actionLabel="Open eval-skills on GitHub"
          />
        </div>
      ) : (
        <NewRunForm skills={skills} pilotFocus={pilotFocus} />
      )}
    </div>
  );
}
