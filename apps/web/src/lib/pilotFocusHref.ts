/** Append or strip ?focus=pilot for list ↔ detail navigation. */
export function isPilotFocusParam(
  focus: string | string[] | undefined,
): boolean {
  const v = Array.isArray(focus) ? focus[0] : focus;
  return v === "pilot";
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
