import { listSkills } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { skillsDirs } from "@/lib/paths";
import { isPilotFocusParam } from "@/lib/pilotFocusHref";
import { NewRunForm } from "./NewRunForm";

export const dynamic = "force-dynamic";

export default async function NewRunPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const sp = await searchParams;
  const pilotFocus = isPilotFocusParam(sp.focus);
  const skills = listSkills(skillsDirs());

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Unikie · Evaluation pipeline</p>
        <h1>New evaluation run</h1>
        <p>
          Unikie Contribution Evaluator: baseline (neutral prompt) vs candidate
          (skill SKILL.md), then Docker grade. Dry-run uses{" "}
          <code>gpt-4o-mini</code>; official uses <code>gpt-4.1-mini</code> (≥3
          repeats).
        </p>
      </header>

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
