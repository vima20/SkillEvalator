"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import type { SettingsSnapshot } from "@/lib/settingsTypes";

function Row(opts: { label: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <dt>{opts.label}</dt>
      <dd>{opts.children}</dd>
    </div>
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

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function pp(n: number): string {
  return `${(n * 100).toFixed(0)} pp`;
}

export function SettingsClient(opts: { initial: SettingsSnapshot }) {
  const [s, setS] = useState(opts.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Settings refresh failed (${res.status})`);
      }
      const next = (await res.json()) as SettingsSnapshot;
      setS(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings refresh failed");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Unikie · Pilot config</p>
        <h1>Settings</h1>
        <p>
          Read-only view of root <code>.env</code> and adoption rules (no
          secrets). Edit <code>.env</code> and restart web + worker to change
          env values.
        </p>
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
          <p className="hint">
            Checked {new Date(s.checkedAt).toLocaleString()} ·{" "}
            <Link href="/">New run</Link> uses the same preflight gate.
          </p>
        </section>

        <section className="panel settings-panel">
          <div className="settings-panel-head">
            <h2>Preflight</h2>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => void refresh()}
              disabled={busy}
            >
              {busy ? "Checking…" : "Refresh"}
            </button>
          </div>
          <dl className="settings-dl">
            <Row label="API key">
              <StatusPill
                ok={s.preflight.checks.openaiApiKey.ok}
                label={s.preflight.checks.openaiApiKey.ok ? "Set" : "Missing"}
              />{" "}
              <span className="hint">
                {s.preflight.checks.openaiApiKey.detail}
              </span>
            </Row>
            <Row label="Docker">
              <StatusPill
                ok={s.preflight.checks.docker.ok}
                label={s.preflight.checks.docker.ok ? "OK" : "Down"}
              />{" "}
              <span className="hint">{s.preflight.checks.docker.detail}</span>
            </Row>
            <Row label="Worker">
              <StatusPill
                ok={s.preflight.checks.worker.ok}
                label={s.preflight.checks.worker.ok ? "Alive" : "Down"}
              />{" "}
              <span className="hint">{s.preflight.checks.worker.detail}</span>
            </Row>
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
                {s.adoption.officialUseScoreFloor} ({pct(s.adoption.officialUseScoreFloor)})
              </code>
            </Row>
            <Row label="Soft-pass floor">
              <code>
                {s.adoption.softPassScoreFloor} ({pct(s.adoption.softPassScoreFloor)})
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
            are code constants — not editable via <code>.env</code>.
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
            Adoption evidence must use Docker grade. Host grade is smoke/CI
            only.
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
              <code>{s.smoke.allowHostGrade ? "1" : "off"}</code>
            </Row>
          </dl>
          <p className="hint">
            Smoke is dry-run / CI only. Official enqueue rejects FAKE_PRODUCE;
            host grade is ignored without smoke.
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
            <Link href="/">New run</Link> Find/Receive — then start a new
            evaluation (Retry keeps the pinned snapshot).
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
