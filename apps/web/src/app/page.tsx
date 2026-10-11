import { listSkills } from "@skillevalator/core";
import { EmptyState } from "@/components/EmptyState";
import { skillsDir } from "@/lib/paths";
import { NewRunForm } from "./NewRunForm";

export const dynamic = "force-dynamic";

export default function NewRunPage() {
  const skills = listSkills(skillsDir());

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Unikie · Evaluation pipeline</p>
        <h1>New evaluation run</h1>
        <p>
          Produce with the model, then grade against expected fixtures. Dry-run
          uses <code>gpt-4o-mini</code>; official uses <code>gpt-4.1-mini</code>{" "}
          (≥3 repeats).
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
        <NewRunForm skills={skills} />
      )}
    </div>
  );
}
