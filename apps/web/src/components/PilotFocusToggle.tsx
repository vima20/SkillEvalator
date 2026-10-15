import Link from "next/link";

/** Server-safe toggle: hide smoke / superseded rows via ?focus=pilot. */
export function PilotFocusToggle(opts: {
  pathname: "/runs" | "/benefit";
  pilotFocus: boolean;
}) {
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
      title="Hide smoke (FAKE_PRODUCE) and superseded candidate retries"
    >
      Pilot focus
    </Link>
  );
}
