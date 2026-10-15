import type { ReactNode } from "react";
import Link from "next/link";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";

export const dynamic = "force-dynamic";

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
  /** Neutral/warn instead of fail (e.g. local open auth). */
  tone?: "ok" | "fail" | "wait";
}) {
  const tone =
    opts.tone ?? (opts.ok ? "ok" : "fail");
  const cls =
    tone === "ok"
      ? "badge-ok"
      : tone === "wait"
        ? "badge-wait"
        : "badge-fail";
  return <span className={`badge ${cls}`}>{opts.label}</span>;
}

export default function SettingsPage() {
  const s = loadSettingsSnapshot();

  return (
    <div>
      <header className="page-header">
        <p className="eyebrow">Unikie · Pilot config</p>
        <h1>Settings</h1>
        <p>
          Read-only view of root <code>.env</code> (no secrets). Edit{" "}
          <code>.env</code> and restart web + worker to change values.
        </p>
      </header>

      <div className="settings-stack">
        <section
          className={`panel settings-panel${s.pilotReady ? "" : " settings-panel-warn"}`}
        >
          <div className="settings-panel-head">
            <h2>Official pilot readiness</h2>
            <StatusPill
              ok={s.pilotReady}
              label={s.pilotReady ? "Ready" : "Blocked"}
            />
          </div>
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
          <h2>Preflight</h2>
          <dl className="settings-dl">
            <Row label="API key">
              <StatusPill
                ok={s.preflight.checks.openaiApiKey.ok}
                label={s.preflight.checks.openaiApiKey.ok ? "Set" : "Missing"}
              />{" "}
              <span className="hint">{s.preflight.checks.openaiApiKey.detail}</span>
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
            Official adoption requires ≥3 repeats and live produce (not
            FAKE_PRODUCE).
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
            <Row label="Web port">
              <code>{s.web.port}</code>
            </Row>
          </dl>
          <p className="hint">
            Token value is never shown. Pilot: set{" "}
            <code>WEB_AUTH_TOKEN</code> and{" "}
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
