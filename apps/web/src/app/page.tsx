import { listSkills } from "@skillevalator/core";
import { allSkillsDirs } from "@/lib/paths";
import { NewRunForm } from "./NewRunForm";

export const dynamic = "force-dynamic";

export default function NewRunPage() {
  const skills = listSkills(allSkillsDirs());

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Unikie · Evaluation pipeline</p>
        <h1>New evaluation run</h1>
        <p>
          Produce with the model, then grade against expected fixtures. Import a
          GitHub repo that contains SkillEvalator skills (
          <code>fixtures/manifest.json</code>), or use a bundled skill. Dry-run
          uses <code>gpt-4o-mini</code>; official uses <code>gpt-4.1-mini</code>{" "}
          (≥3 repeats).
        </p>
      </header>

      <NewRunForm skills={skills} />
    </div>
  );
}
