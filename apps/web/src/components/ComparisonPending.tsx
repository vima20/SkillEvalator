"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { statusBadgeClass } from "@/lib/status";

export function ComparisonPending({
  evaluationId,
  baselineRunId,
  candidateRunId,
  baselineStatus,
  candidateStatus,
}: {
  evaluationId: string;
  baselineRunId?: string;
  candidateRunId?: string;
  baselineStatus?: string;
  candidateStatus?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [router, evaluationId]);

  return (
    <div className="panel progress-panel">
      <p className="eyebrow">Waiting for both legs</p>
      <h2>Comparison not ready</h2>
      <p>
        Baseline and candidate must finish before lift and PASS/FAIL can be
        computed. This page refreshes automatically.
      </p>
      <dl className="meta-list">
        <div>
          <dt>Baseline</dt>
          <dd>
            <span className={statusBadgeClass(baselineStatus)}>
              {baselineStatus ?? "missing"}
            </span>
            {baselineRunId ? (
              <>
                {" "}
                <Link href={`/runs/${baselineRunId}`}>{baselineRunId}</Link>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Candidate</dt>
          <dd>
            <span className={statusBadgeClass(candidateStatus)}>
              {candidateStatus ?? "missing"}
            </span>
            {candidateRunId ? (
              <>
                {" "}
                <Link href={`/runs/${candidateRunId}`}>{candidateRunId}</Link>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Evaluation</dt>
          <dd>
            <code>{evaluationId}</code>
          </dd>
        </div>
      </dl>
    </div>
  );
}
