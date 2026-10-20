/** Append or strip ?focus=pilot for list ↔ detail navigation. */
export function isPilotFocusParam(
  focus: string | string[] | undefined,
): boolean {
  const v = Array.isArray(focus) ? focus[0] : focus;
  return v === "pilot";
}

/** Settings Ready / Comparison·Benefit re-run → New run preferOfficial. */
export function isOfficialModeParam(
  mode: string | string[] | undefined,
): boolean {
  const v = Array.isArray(mode) ? mode[0] : mode;
  return v === "official";
}

export function withPilotFocus(href: string, pilotFocus: boolean): string {
  if (!pilotFocus) return href;
  const qIndex = href.indexOf("?");
  const path = qIndex >= 0 ? href.slice(0, qIndex) : href;
  const qs = qIndex >= 0 ? href.slice(qIndex + 1) : "";
  const params = new URLSearchParams(qs);
  params.set("focus", "pilot");
  return `${path}?${params.toString()}`;
}

/**
 * New-run handoff: optional ?mode=official (Settings Ready parity) + focus=pilot.
 * Dry-run / unknown mode → "/" only (plus focus when requested).
 */
export function withNewRunHandoff(
  pilotFocus: boolean,
  preferOfficial = false,
): string {
  const href = preferOfficial ? "/?mode=official" : "/";
  return withPilotFocus(href, pilotFocus);
}
