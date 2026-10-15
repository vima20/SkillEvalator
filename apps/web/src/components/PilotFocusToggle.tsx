import Link from "next/link";

export type PilotFocusPath =
  | "/"
  | "/settings"
  | "/runs"
  | "/benefit"
  | "/comparison"
  | "/dashboard";

/** Server-safe toggle: hide smoke / dry-run noise via ?focus=pilot. */
export function PilotFocusToggle(opts: {
  pathname: PilotFocusPath;
  pilotFocus: boolean;
  /**
   * Detail path (e.g. `/runs/run_x`). When set, toggle stays on the detail
   * page instead of jumping to the list parent.
   */
  detailHref?: string;
}) {
  const base = opts.detailHref ?? opts.pathname;
  const isDetail = Boolean(opts.detailHref);
  const title = isDetail
    ? "Keep ?focus=pilot on detail ↔ list navigation"
    : opts.pathname === "/comparison"
      ? "Hide dry-run, smoke (either tip leg), and official INCONCLUSIVE"
      : opts.pathname === "/dashboard"
        ? "Show only official tip candidates on the leaderboard"
        : opts.pathname === "/" || opts.pathname === "/settings"
          ? "Keep ?focus=pilot on New run / Settings / list navigation"
          : "Hide smoke, superseded retries, and dry-run rows";

  const clearLabel =
    isDetail || opts.pathname === "/" || opts.pathname === "/settings"
      ? "Clear pilot focus"
      : "Show all rows";

  if (opts.pilotFocus) {
    return (
      <Link className="btn btn-ghost btn-compact" href={base}>
        {clearLabel}
      </Link>
    );
  }
  return (
    <Link
      className="btn btn-ghost btn-compact"
      href={`${base}?focus=pilot`}
      title={title}
    >
      Pilot focus
    </Link>
  );
}
