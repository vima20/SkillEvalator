import Link from "next/link";

/** Server-safe toggle: hide smoke / dry-run noise via ?focus=pilot. */
export function PilotFocusToggle(opts: {
  pathname: "/runs" | "/benefit" | "/comparison" | "/dashboard";
  pilotFocus: boolean;
}) {
  const title =
    opts.pathname === "/comparison"
      ? "Hide dry-run and smoke (either tip leg)"
      : opts.pathname === "/dashboard"
        ? "Show only official tip candidates on the leaderboard"
        : "Hide smoke, superseded retries, and dry-run rows";

  if (opts.pilotFocus) {
    return (
      <Link className="btn btn-ghost btn-compact" href={opts.pathname}>
        Show all rows
      </Link>
    );
  }
  return (
    <Link
      className="btn btn-ghost btn-compact"
      href={`${opts.pathname}?focus=pilot`}
      title={title}
    >
      Pilot focus
    </Link>
  );
}
