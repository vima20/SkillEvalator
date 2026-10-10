import Link from "next/link";
import {
  benefitReportToMarkdown,
  buildBenefitReport,
  loadRunResult,
} from "@skillevalator/core";
import { StarRating } from "@/components/StarRating";
import { resultsDir } from "@/lib/paths";
import { statusBadgeClass } from "@/lib/status";
import { BenefitActions } from "./BenefitActions";

export const dynamic = "force-dynamic";

export default async function BenefitReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  let result: ReturnType<typeof loadRunResult> = null;
  let invalid = false;

  try {
    result = loadRunResult(resultsDir(), runId);
  } catch {
    invalid = true;
  }

  if (invalid) {
    return (
      <div>
        <header className="page-header">
          <h1>Invalid run</h1>
          <p>The run id is not allowed.</p>
        </header>
      </div>
    );
  }

  if (!result) {
    return (
      <div>
        <header className="page-header">
          <p className="eyebrow">
            <Link href="/benefit">Benefit Report</Link>
            <span aria-hidden="true"> / </span>
            {runId}
          </p>
          <h1>Report not ready</h1>
          <p>This run has no result.json yet. Wait for the worker to finish.</p>
        </header>
        <Link className="btn btn-primary" href={`/runs/${runId}`}>
          Open run
        </Link>
      </div>
    );
  }

  const report = buildBenefitReport(result);
  const markdown = benefitReportToMarkdown(report);

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">
            <Link href="/benefit">Benefit Report</Link>
            <span aria-hidden="true"> / </span>
            {runId}
          </p>
          <h1>{report.title}</h1>
          <p>{report.generatedAt}</p>
        </div>
        <BenefitActions runId={runId} markdown={markdown} />
      </header>

      <section
        className={`panel verdict-banner verdict-${report.verdict.recommendation}`}
      >
        <p className="eyebrow">Tuomio</p>
        <h2 className="verdict-headline">{report.verdict.headline}</h2>
        <p className="verdict-decision">{report.verdict.decision}</p>
        <p className="verdict-rationale">{report.verdict.rationale}</p>
        <StarRating
          stars={report.rating.stars}
          grade={report.rating.grade}
          summary={report.rating.summary}
        />
      </section>

      <section className="panel report-section">
        <h2>Kirjallinen arvio</h2>
        <div className="written-review">
          {report.rating.review.split("\n\n").map((para) => (
            <p key={para.slice(0, 48)}>{para}</p>
          ))}
        </div>
      </section>

      <div className="panel callout-warn">
        <strong>Disclaimer</strong>
        <p>{report.disclaimer}</p>
      </div>

      <section className="panel report-section">
        <h2>Decision question</h2>
        <p className="decision-q">{report.decisionQuestion}</p>
      </section>

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-label">Label</span>
          <span className="stat-value">{report.scorecard.label}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Score</span>
          <span className="stat-value">{report.scorecard.score ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Spread</span>
          <span className="stat-value">
            {report.scorecard.scoreSpread.toFixed(3)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Tasks</span>
          <span className="stat-value">
            {report.scorecard.tasksPassed}/{report.scorecard.tasksTotal}
          </span>
        </div>
      </div>

      <section className="panel report-section">
        <h2>Config</h2>
        <dl className="meta-list">
          <div>
            <dt>Mode</dt>
            <dd>
              <code>{report.config.mode}</code>
            </dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>
              <code>{report.config.modelId}</code>
            </dd>
          </div>
          <div>
            <dt>Skill</dt>
            <dd>
              <code>{report.config.evalSkillId}</code>{" "}
              <code>{report.config.evalSkillVersion}</code>
            </dd>
          </div>
          <div>
            <dt>Task set</dt>
            <dd>
              <code>{report.config.taskSetId}</code>
            </dd>
          </div>
          <div>
            <dt>Repeats</dt>
            <dd>
              {report.config.repeats} ({report.config.aggregate})
            </dd>
          </div>
          <div>
            <dt>Decoding</dt>
            <dd>
              temp={report.config.decoding.temperature}, top_p=
              {report.config.decoding.top_p}, seed=
              {report.config.decoding.seed ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Pipeline</dt>
            <dd>
              {report.config.pipeline.produce} → {report.config.pipeline.grade}
            </dd>
          </div>
          {report.config.evalSkillGithubUrl ? (
            <div>
              <dt>GitHub</dt>
              <dd>
                <a
                  href={report.config.evalSkillGithubUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {report.config.evalSkillGithubUrl}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="panel report-section">
        <h2>Scorecard</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Score</th>
              <th>Status</th>
              <th>Label</th>
            </tr>
          </thead>
          <tbody>
            {report.scorecard.perTask.map((t) => (
              <tr key={t.taskId}>
                <td>
                  <code>{t.taskId}</code>
                </td>
                <td>{t.score ?? "—"}</td>
                <td>
                  <span className={statusBadgeClass(t.status)}>{t.status}</span>
                </td>
                <td>
                  <strong>{t.label}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel report-section">
        <h2>Harness checks</h2>
        <p>{report.harnessChecks.note}</p>
        <ul className="bullet-list">
          <li>
            Known-good fixtures:{" "}
            {report.harnessChecks.knownGoodSupported ? "yes" : "no"}
          </li>
          <li>
            Known-bad fixtures:{" "}
            {report.harnessChecks.knownBadSupported ? "yes" : "no"}
          </li>
        </ul>
      </section>

      <section className="panel report-section">
        <h2>Constraints</h2>
        <ul className="bullet-list">
          {report.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <section className="panel report-section">
        <h2>Cost</h2>
        <dl className="meta-list">
          <div>
            <dt>Status</dt>
            <dd>
              <span className={statusBadgeClass(report.cost.status)}>
                {report.cost.status}
              </span>
            </dd>
          </div>
          <div>
            <dt>Cost USD</dt>
            <dd>${report.cost.costUsd.toFixed(4)}</dd>
          </div>
          <div>
            <dt>Latency</dt>
            <dd>{Math.round(report.cost.latencyMs / 1000)}s</dd>
          </div>
          <div>
            <dt>Findings</dt>
            <dd>
              {report.cost.findings.length
                ? report.cost.findings.join("; ")
                : "(none)"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
