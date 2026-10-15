import Link from "next/link";

/** Server-safe toggle: hide smoke / dry-run noise via ?focus=pilot. */
export function PilotFocusToggle(opts: {
  pathname: "/runs" | "/benefit" | "/comparison";
  pilotFocus: boolean;
}) {
  const title =
    opts.pathname === "/comparison"
      ? "Hide dry-run and smoke evaluations"
      : "Hide smoke (FAKE_PRODUCE) and superseded candidate retries";

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
