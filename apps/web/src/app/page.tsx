import { listSkills } from "@skillevalator/core";
import { skillsDir } from "@/lib/paths";
import { NewRunForm } from "./NewRunForm";

export const dynamic = "force-dynamic";

export default function NewRunPage() {
  const skills = listSkills(skillsDir());

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Evaluation pipeline</p>
        <h1>New evaluation run</h1>
        <p>
          Produce with the model, then grade against expected fixtures. Dry-run
          uses <code>gpt-4o-mini</code>; official uses <code>gpt-4.1-mini</code>{" "}
          (≥3 repeats).
        </p>
      </header>

      {skills.length === 0 ? (
        <div className="panel">
          <p className="empty">
            No eval skills found under <code>eval-skills/</code>.
          </p>
        </div>
      ) : (
        <NewRunForm skills={skills} />
      )}
    </div>
  );
}
