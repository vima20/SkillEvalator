import { resolveWebAuthConfig } from "@/lib/webAuth";
import type { RunPreflightResult } from "@/lib/runPreflight";

/**
 * Same blocker list as Settings Ready — shared by snapshot UI and official enqueue.
 */
export function collectPilotBlockers(opts: {
  preflight: Pick<RunPreflightResult, "checks">;
  env?: Record<string, string | undefined>;
}): string[] {
  const env = opts.env ?? process.env;
  const webAuth = resolveWebAuthConfig(env.WEB_AUTH_TOKEN);
  const fakeProduce = env.FAKE_PRODUCE === "known-good";
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
  if (webAuth.kind === "misconfigured") {
    pilotBlockers.push("WEB_AUTH_TOKEN misconfigured (empty/whitespace)");
  }
  if (officialRequiresWebAuth && webAuth.kind !== "required") {
    pilotBlockers.push(
      "OFFICIAL_REQUIRES_WEB_AUTH=true but WEB_AUTH_TOKEN is not set",
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
