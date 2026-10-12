import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { listEvaluations } from "@/lib/evaluations";

export const dynamic = "force-dynamic";

export default function ComparisonListPage() {
  const evaluations = listEvaluations();

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Baseline ↔ candidate</p>
          <h1>Comparison</h1>
          <p>
            Paired evaluations: neutral baseline vs skill candidate on the same
            task set, model, and repeats.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-primary" href="/">
            New evaluation
          </Link>
        </div>
      </header>

      <div className="panel">
        {evaluations.length === 0 ? (
          <EmptyState
            title="No paired evaluations yet"
            body="Start a run with baseline↔candidate enabled to queue both legs and open Comparison."
            actionHref="/"
            actionLabel="New evaluation"
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Evaluation</th>
                  <th>Skill</th>
                  <th>Mode</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => (
                  <tr key={e.evaluationId}>
                    <td>
                      <Link href={`/comparison/${e.evaluationId}`}>
                        {e.evaluationId}
                      </Link>
                    </td>
                    <td>
                      <code>{e.evalSkillId}</code>
                    </td>
                    <td>{e.mode}</td>
                    <td>{e.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
