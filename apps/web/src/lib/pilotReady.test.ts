import { describe, expect, it } from "vitest";
import {
  collectPilotBlockers,
  officialPilotReadyGate,
} from "./pilotReady.js";

const okChecks = {
  openaiApiKey: { ok: true, detail: "set" },
  docker: { ok: true, detail: "ok" },
  worker: { ok: true, detail: "ok" },
};

describe("collectPilotBlockers / officialPilotReadyGate", () => {
  it("is empty when preflight ok and smoke/auth clean", () => {
    expect(
      collectPilotBlockers({
        preflight: { checks: okChecks },
        env: { OPENAI_API_KEY: "sk", WEB_AUTH_TOKEN: "secret" },
      }),
    ).toEqual([]);
    expect(
      officialPilotReadyGate({
        mode: "official",
        preflight: { checks: okChecks },
        env: { OPENAI_API_KEY: "sk", WEB_AUTH_TOKEN: "secret" },
      }).ok,
    ).toBe(true);
  });

  it("allows dry-run even when blocked", () => {
    expect(
      officialPilotReadyGate({
        mode: "dry-run",
        preflight: {
          checks: {
            ...okChecks,
            docker: { ok: false, detail: "down" },
          },
        },
        env: { FAKE_PRODUCE: "known-good" },
      }).ok,
    ).toBe(true);
  });

  it("blocks official on FAKE_PRODUCE and misconfigured auth", () => {
    const fake = officialPilotReadyGate({
      mode: "official",
      preflight: { checks: okChecks },
      env: { FAKE_PRODUCE: "known-good", OPENAI_API_KEY: "sk" },
    });
    expect(fake.ok).toBe(false);
    if (!fake.ok) {
      expect(fake.errorCode).toBe("official_pilot_not_ready");
      expect(fake.blockers.some((b) => /FAKE_PRODUCE/i.test(b))).toBe(true);
    }

    const auth = officialPilotReadyGate({
      mode: "official",
      preflight: { checks: okChecks },
      env: { OPENAI_API_KEY: "sk", WEB_AUTH_TOKEN: "   " },
    });
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.blockers.some((b) => /misconfigured/i.test(b))).toBe(true);
    }
  });

  it("blocks when OFFICIAL_REQUIRES_WEB_AUTH without token", () => {
    const out = officialPilotReadyGate({
      mode: "official",
      preflight: { checks: okChecks },
      env: {
        OPENAI_API_KEY: "sk",
        OFFICIAL_REQUIRES_WEB_AUTH: "true",
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(
        out.blockers.some((b) => /OFFICIAL_REQUIRES_WEB_AUTH/i.test(b)),
      ).toBe(true);
    }
  });
});
