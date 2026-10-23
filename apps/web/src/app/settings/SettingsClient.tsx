"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PilotFocusToggle } from "@/components/PilotFocusToggle";
import { apiFetch, UnauthorizedError } from "@/lib/apiFetch";
import { tryResolveAuthApiError } from "@/lib/authResolve";
import {
  isPilotFocusParam,
  listNewRunHref,
  withNewRunHandoff,
  withPilotFocus,
} from "@/lib/pilotFocusHref";
import { resolveSettingsRefreshError } from "@/lib/preflightSettingsResolve";
import {
  isSettingsSnapshot,
  type SettingsPreflightCheck,
  type SettingsSnapshot,
} from "@/lib/settingsTypes";

function Row(opts: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{opts.label}</dt>
      <dd>{opts.children}</dd>
    </>
  );
}

function StatusPill(opts: {
  ok: boolean;
  label: string;
  tone?: "ok" | "fail" | "wait";
}) {
  const tone = opts.tone ?? (opts.ok ? "ok" : "fail");
  const cls =
    tone === "ok"
      ? "badge-ok"
      : tone === "wait"
        ? "badge-wait"
        : "badge-fail";
  return <span className={`badge ${cls}`}>{opts.label}</span>;
}

function CheckRow(opts: {
  label: string;
  check: SettingsPreflightCheck;
  okLabel: string;
  failLabel: string;
}) {
  return (
    <Row label={opts.label}>
      <StatusPill
        ok={opts.check.ok}
        label={opts.check.ok ? opts.okLabel : opts.failLabel}
      />{" "}
      <span className="hint">{opts.check.detail}</span>
    </Row>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function pp(n: number): string {
  return `${(n * 100).toFixed(0)} pp`;
}

function shortCommit(commit: string): string {
  return commit.length > 12 ? `${commit.slice(0, 7)}…` : commit;
}

export function SettingsClient(opts: { initial: SettingsSnapshot }) {
  const searchParams = useSearchParams();
  const pilotFocus = isPilotFocusParam(
    searchParams.get("focus") ?? undefined,
  );
  const [s, setS] = useState(opts.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const silent = opts?.silent === true;
    if (!silent) {
      setBusy(true);
      setError(null);
    }
    try {
      // Silent poll: browse heal only. Manual Refresh: ?heal=1 full heal.
      const path = silent ? "/api/settings" : "/api/settings?heal=1";
      const res = await apiFetch(path, {
        cache: "no-store",
        signal: ac.signal,
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        if (!silent) {
          setError(
            tryResolveAuthApiError(body) ??
              resolveSettingsRefreshError("http", res.status),
          );
        }
        return;
      }
      const next: unknown = await res.json();
      if (!isSettingsSnapshot(next)) {
        if (!silent) {
          setError(resolveSettingsRefreshError("unexpected_payload"));
        }
        return;
      }
      setS(next);
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e instanceof UnauthorizedError) return;
      if (!silent) {
        setError(resolveSettingsRefreshError("network"));
      }
    } finally {
      if (!ac.signal.aborted && !silent) setBusy(false);
    }
  }, []);

  const needsQueuePoll =
    s.queue.queued > 0 ||
    s.queue.running > 0 ||
    (s.queue.staleRunningRunIds?.length ?? 0) > 0;
  /** Keep Ready/queue flip (e.g. FAKE unset on another tab) without idle spin. */
  const needsSettingsPoll = needsQueuePoll || !s.pilotReady;

  useEffect(() => {
    if (!needsSettingsPoll) return;
    const id = window.setInterval(() => {
      void refresh({ silent: true });
    }, 8000);
    return () => window.clearInterval(id);
  }, [needsSettingsPoll, refresh]);

  return (
    <div>
      <header className="page-header page-header-row">
        <div>
          <p className="eyebrow">Unikie · Pilot config</p>
          <h1>Settings</h1>
          <p>
            Read-only view of root <code>.env</code> and adoption rules (no
            secrets). Edit <code>.env</code> and restart web + worker to change
            env values.
          </p>
        </div>
        <div className="page-header-actions">
          <PilotFocusToggle pathname="/settings" pilotFocus={pilotFocus} />
        </div>
      </header>

      <div className="settings-stack">
        <section
          className={`panel settings-panel${s.pilotReady ? "" : " settings-panel-warn"}`}
        >
          <div className="settings-panel-head">
            <h2>Official pilot readiness</h2>
            <div className="settings-head-actions">
              <StatusPill
                ok={s.pilotReady}
                label={s.pilotReady ? "Ready" : "Blocked"}
              />
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => void refresh()}
                disabled={busy}
              >
                {busy ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {s.pilotReady ? (
            <p className="hint">
              Preflight OK and smoke flags off — safe for live official
              baseline↔candidate.
            </p>
          ) : (
            <ul className="settings-blockers">
              {s.pilotBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <p className="settings-cta">
            {s.pilotReady ? (
              <>
                <Link
                  className="btn btn-primary"
                  href={withNewRunHandoff(pilotFocus, true)}
                >
                  Start official baseline↔candidate
                </Link>{" "}
                <Link
                  className="btn btn-ghost"
                  href={withPilotFocus("/comparison", true)}
                >
                  Comparison (pilot)
                </Link>
              </>
            ) : (
              <Link
                className="btn btn-ghost"
                href={withPilotFocus("/", pilotFocus)}
              >
                Open New run (dry-run)
              </Link>
            )}
          </p>
          <p className="hint">
            Checked {new Date(s.checkedAt).toLocaleString()} · New run uses the
            same preflight gate. Lists:{" "}
            <Link href={withPilotFocus("/runs", true)}>Runs</Link> /{" "}
            <Link href={withPilotFocus("/comparison", true)}>Comparison</Link> /{" "}
            <Link href={withPilotFocus("/benefit", true)}>Benefit</Link> /{" "}
            <Link href={withPilotFocus("/dashboard", true)}>Dashboard</Link>{" "}
            pilot focus.
            See{" "}
            <a
              href="https://github.com/vima20/SkillEvalator/blob/main/docs/PILOT-CHECKLIST.md"
              target="_blank"
              rel="noreferrer"
            >
              PILOT-CHECKLIST.md
            </a>
            .
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Build &amp; queue</h2>
          {needsSettingsPoll ? (
            <p className="hint">
              Auto-refreshing every 8s while jobs are queued/running/stale or
              Ready is Blocked (reclaims dead{" "}
              <code>.running.json</code>; full orphan heal is the Refresh
              button).
            </p>
          ) : null}
          <dl className="settings-dl">
            <Row label="Git SHA">
              {s.build.gitShaShort ? (
                <span>
                  <code title={s.build.gitSha ?? undefined}>
                    {s.build.gitShaShort}
                  </code>
                  {s.build.dirty ? (
                    <>
                      {" "}
                      <StatusPill ok={false} tone="wait" label="dirty" />
                    </>
                  ) : null}
                </span>
              ) : (
                <span className="hint">unavailable</span>
              )}
            </Row>
            <Row label="Queued">
              <code>{s.queue.queued}</code>
            </Row>
            <Row label="Running">
              <code>{s.queue.running}</code>
              {s.queue.activeRunId ? (
                <>
                  {" "}
                  <Link
                    href={withPilotFocus(
                      `/runs/${s.queue.activeRunId}`,
                      pilotFocus,
                    )}
                  >
                    {s.queue.activeRunId}
                  </Link>
                </>
              ) : null}
            </Row>
            {(s.queue.staleRunningRunIds?.length ?? 0) > 0 ? (
              <Row label="Stale running">
                <StatusPill ok={false} tone="wait" label="orphan" />{" "}
                {s.queue.staleRunningRunIds!.map((id, i) => (
                  <span key={id}>
                    {i > 0 ? ", " : null}
                    <Link href={withPilotFocus(`/runs/${id}`, pilotFocus)}>
                      {id}
                    </Link>
                  </span>
                ))}
              </Row>
            ) : null}
          </dl>
          <p className="hint">
            Record the git SHA with pilot archives. Queue counts are files under{" "}
            <code>{s.paths.jobsDir}</code>. Refresh runs a full orphan heal
            (including stuck <code>budget_stop</code> → failed) before
            re-checking Ready; auto-poll only reclaims dead{" "}
            <code>.running.json</code>.
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Preflight</h2>
          <dl className="settings-dl">
            <CheckRow
              label="API key"
              check={s.preflight.checks.openaiApiKey}
              okLabel="Set"
              failLabel="Missing"
            />
            <CheckRow
              label="Docker"
              check={s.preflight.checks.docker}
              okLabel="OK"
              failLabel="Down"
            />
            <CheckRow
              label="Worker"
              check={s.preflight.checks.worker}
              okLabel="Alive"
              failLabel="Down"
            />
          </dl>
        </section>

        <section className="panel settings-panel">
          <h2>Adoption rules</h2>
          <dl className="settings-dl">
            <Row label="Official min repeats">
              <code>≥ {s.adoption.officialMinRepeats}</code>
            </Row>
            <Row label="USE score floor">
              <code>
                {s.adoption.officialUseScoreFloor} (
                {pct(s.adoption.officialUseScoreFloor)})
              </code>
            </Row>
            <Row label="Soft-pass floor">
              <code>
                {s.adoption.softPassScoreFloor} (
                {pct(s.adoption.softPassScoreFloor)})
              </code>
            </Row>
            <Row label="Lift for PASS">
              <code>
                ≥ {s.adoption.liftPassDelta} ({pp(s.adoption.liftPassDelta)})
              </code>
            </Row>
          </dl>
          <p className="hint">
            Official Comparison PASS needs candidate ≥ USE floor and lift ≥{" "}
            {pp(s.adoption.liftPassDelta)}. Soft-pass alone is not USE. These
            are code constants — not editable via <code>.env</code>. See{" "}
            <a
              href="https://github.com/vima20/SkillEvalator/blob/main/docs/ACCEPTANCE.md"
              target="_blank"
              rel="noreferrer"
            >
              ACCEPTANCE.md
            </a>
            .
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Grade policy</h2>
          <dl className="settings-dl">
            <Row label="Live / official">
              <code>{s.grade.livePolicy}</code> (Docker)
            </Row>
            <Row label="Host grade">
              {s.grade.hostGradeOnlyWithFakeProduce ? (
                <span>
                  Only with <code>FAKE_PRODUCE=known-good</code>
                </span>
              ) : (
                "—"
              )}
            </Row>
          </dl>
          <p className="hint">
            Official Comparison requires <code>grade=docker_script</code>,{" "}
            <code>pipeline.grade=docker_script</code> and{" "}
            <code>allowHostGrade=false</code> on capture (same as{" "}
            <a
              href="https://github.com/vima20/SkillEvalator/blob/main/docs/ACCEPTANCE.md"
              target="_blank"
              rel="noreferrer"
            >
              ACCEPTANCE.md
            </a>
            ). Live runs use <code>{s.grade.livePolicy}</code> in Docker; host
            grade is smoke/CI only
            {s.grade.hostGradeOnlyWithFakeProduce
              ? " (host allowed only with FAKE_PRODUCE=known-good)"
              : ""}
            .
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Models</h2>
          <dl className="settings-dl">
            <Row label="Dry-run">
              <code>{s.models.dryRun}</code>
            </Row>
            <Row label="Official">
              <code>{s.models.official}</code>
            </Row>
          </dl>
          <p className="hint">
            Official adoption requires ≥{s.adoption.officialMinRepeats} repeats
            and live produce (not FAKE_PRODUCE).
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Decoding</h2>
          <dl className="settings-dl">
            <Row label="Temperature">
              <code>{s.decoding.temperature}</code>
            </Row>
            <Row label="Top P">
              <code>{s.decoding.topP}</code>
            </Row>
            <Row label="Seed">
              <code>{s.decoding.seed}</code>
            </Row>
            <Row label="Max output tokens">
              <code>{s.decoding.maxOutputTokens}</code>
            </Row>
            <Row label="OpenAI timeout">
              <code>{s.decoding.openaiTimeoutMs} ms</code>
            </Row>
          </dl>
          <p className="hint">
            Baseline and candidate must share the same decoding for fair lift.
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Cost</h2>
          <dl className="settings-dl">
            <Row label="Cost cap">
              <code>${s.cost.costCapUsd}</code>
            </Row>
            <Row label="Hard stop">
              <code>{s.cost.costHardStop ? "true" : "false"}</code>
            </Row>
          </dl>
        </section>

        <section className="panel settings-panel">
          <h2>Auth &amp; access</h2>
          <dl className="settings-dl">
            <Row label="WEB_AUTH_TOKEN">
              {s.auth.webAuthMisconfigured ? (
                <StatusPill ok={false} label="Misconfigured" />
              ) : s.auth.webAuthEnabled ? (
                <StatusPill ok={true} label="Enabled" />
              ) : (
                <StatusPill ok={false} tone="wait" label="Open (unset)" />
              )}
            </Row>
            <Row label="Official requires auth">
              <code>{s.auth.officialRequiresWebAuth ? "true" : "false"}</code>
            </Row>
            <Row label="Bind">
              <code>{s.web.bindHint}</code>
            </Row>
            <Row label="Web port">
              <code>{s.web.port}</code>
            </Row>
          </dl>
          <p className="hint">
            Token value is never shown. UI is loopback-only (
            <code>127.0.0.1</code>
            ). Pilot: set <code>WEB_AUTH_TOKEN</code> and{" "}
            <code>OFFICIAL_REQUIRES_WEB_AUTH=true</code>.
          </p>
        </section>

        <section
          className={`panel settings-panel${s.smoke.blocksOfficial ? " settings-panel-warn" : ""}`}
        >
          <h2>Smoke harness</h2>
          <dl className="settings-dl">
            <Row label="FAKE_PRODUCE">
              {s.smoke.fakeProduce ? (
                <StatusPill ok={false} label="known-good (smoke)" />
              ) : (
                <StatusPill ok={true} label="Off" />
              )}
            </Row>
            <Row label="ALLOW_HOST_GRADE">
              {s.smoke.allowHostGrade ? (
                <StatusPill ok={false} label="On (blocks Ready)" />
              ) : (
                <StatusPill ok={true} label="Off" />
              )}
            </Row>
          </dl>
          <p className="hint">
            Smoke is dry-run / CI only. Official Ready / enqueue reject{" "}
            <code>FAKE_PRODUCE</code> and <code>ALLOW_HOST_GRADE=1</code> (host
            grade is smoke/CI only; leave both Off for live pilot).
          </p>
        </section>

        <section className="panel settings-panel">
          <div className="settings-panel-head">
            <h2>Skills on disk</h2>
            <span className="badge badge-wait">
              {s.skills.rows.length} skill
              {s.skills.rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="hint">
            Read-only. Edit <code>SKILL.md</code> under{" "}
            <code>{s.paths.evalSkillsDir}</code> or re-import via{" "}
            <Link href={listNewRunHref(pilotFocus)}>New run</Link>{" "}
            Find/Receive — then start a new evaluation (Retry keeps the pinned
            snapshot).
          </p>
          {s.skills.rows.length === 0 ? (
            <p className="hint">
              No valid skills found. Add{" "}
              <code>fixtures/manifest.json</code> under eval-skills or import
              a skill.
            </p>
          ) : (
            <div className="settings-table-scroll">
              <table className="data-table settings-skills-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Source</th>
                    <th>Task set</th>
                    <th>Tasks</th>
                    <th>License</th>
                    <th>Commit</th>
                    <th>Repo</th>
                  </tr>
                </thead>
                <tbody>
                  {s.skills.rows.map((sk) => (
                    <tr key={`${sk.source}:${sk.id}`}>
                      <td>
                        <code>{sk.id}</code>
                      </td>
                      <td>
                        <span
                          className={`badge ${sk.source === "imported" ? "badge-run" : "badge-ok"}`}
                        >
                          {sk.source === "imported"
                            ? "imported"
                            : "eval-skills"}
                        </span>
                      </td>
                      <td>
                        <code>{sk.taskSetId}</code>
                      </td>
                      <td>
                        {sk.taskCount}
                        <span className="hint">
                          {" "}
                          ({sk.dryRunCount} dry-run)
                        </span>
                      </td>
                      <td>{sk.license}</td>
                      <td>
                        {sk.commit ? (
                          <code title={sk.commit}>
                            {shortCommit(sk.commit)}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {sk.githubUrl ? (
                          <a
                            href={sk.githubUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            GitHub
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint">
            Bundled: {s.skills.bundledCount} · Imported:{" "}
            {s.skills.importedCount}
          </p>
        </section>

        <section className="panel settings-panel">
          <h2>Data paths</h2>
          <dl className="settings-dl">
            <Row label="Eval skills">
              <code>{s.paths.evalSkillsDir}</code>
            </Row>
            <Row label="Imported skills">
              <code>{s.paths.importedSkillsDir}</code>
            </Row>
            <Row label="Jobs">
              <code>{s.paths.jobsDir}</code>
            </Row>
            <Row label="Results">
              <code>{s.paths.resultsDir}</code>
            </Row>
          </dl>
          <p className="hint">
            Paths are relative to the repo root. Change via{" "}
            <code>EVAL_SKILLS_DIR</code>, <code>JOBS_DIR</code>,{" "}
            <code>RESULTS_DIR</code> in <code>.env</code>.
          </p>
        </section>
      </div>
    </div>
  );
}
