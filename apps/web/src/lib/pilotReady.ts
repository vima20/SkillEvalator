import { AUTH_MISCONFIGURED_API_ERROR } from "@/lib/authResolve";
import { resolveWebAuthConfig } from "@/lib/webAuth";
import type { RunPreflightResult } from "@/lib/runPreflight";

/**
 * Same blocker list as Settings Ready — shared by snapshot UI and official enqueue.
 */
export function collectPilotBlockers(opts: {
  preflight: Pick<RunPreflightResult, "checks">;
  env?: Record<string, string | undefined>;
  /** Stale .running.json runIds (inspect ≠ skip_alive). */
  staleRunningRunIds?: string[];
}): string[] {
  const env = opts.env ?? process.env;
  const webAuth = resolveWebAuthConfig(env.WEB_AUTH_TOKEN);
  const fakeProduce = env.FAKE_PRODUCE === "known-good";
  const allowHostGrade = env.ALLOW_HOST_GRADE === "1";
  const officialRequiresWebAuth = env.OFFICIAL_REQUIRES_WEB_AUTH === "true";

  const pilotBlockers: string[] = [];
  if (!opts.preflight.checks.openaiApiKey.ok) {
    pilotBlockers.push("OPENAI_API_KEY missing (live produce)");
  }
  if (!opts.preflight.checks.docker.ok) {
    pilotBlockers.push("Docker not reachable");
  }
  if (!opts.preflight.checks.worker.ok) {
    pilotBlockers.push("Worker not alive");
  }
  if (fakeProduce) {
    pilotBlockers.push(
      "FAKE_PRODUCE=known-good — unset for official live pilot",
    );
  }
  if (allowHostGrade) {
    pilotBlockers.push(
      "ALLOW_HOST_GRADE=1 — unset for official (capture pin / Comparison)",
    );
  }
  if (webAuth.kind === "misconfigured") {
    pilotBlockers.push(AUTH_MISCONFIGURED_API_ERROR);
  }
  if (officialRequiresWebAuth && webAuth.kind !== "required") {
    pilotBlockers.push(
      "OFFICIAL_REQUIRES_WEB_AUTH=true but WEB_AUTH_TOKEN is not set",
    );
  }
  const stale = (opts.staleRunningRunIds ?? []).filter(Boolean);
  if (stale.length > 0) {
    const shown = stale.slice(0, 3).join(", ");
    const more = stale.length > 3 ? ` (+${stale.length - 3} more)` : "";
    pilotBlockers.push(
      `Stale queue: orphan .running.json for ${shown}${more} — Refresh Settings, open Runs, or Comparison (heal on load)`,
    );
  }
  return pilotBlockers;
}

export type OfficialPilotReadyOk = { ok: true };

export type OfficialPilotReadyDenied = {
  ok: false;
  status: 503;
  error: string;
  errorCode: "official_pilot_not_ready";
  blockers: string[];
};

/** Fail-closed: official enqueue requires Settings Ready (same blockers). */
export function officialPilotReadyGate(opts: {
  mode: "dry-run" | "official";
  preflight: Pick<RunPreflightResult, "checks">;
  env?: Record<string, string | undefined>;
  staleRunningRunIds?: string[];
}): OfficialPilotReadyOk | OfficialPilotReadyDenied {
  if (opts.mode !== "official") return { ok: true };
  const blockers = collectPilotBlockers(opts);
  if (blockers.length === 0) return { ok: true };
  return {
    ok: false,
    status: 503,
    errorCode: "official_pilot_not_ready",
    error: `official mode blocked — Settings not Ready: ${blockers.join("; ")}`,
    blockers,
  };
}
