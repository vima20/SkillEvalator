"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { isPilotFocusParam, withPilotFocus } from "@/lib/pilotFocusHref";

function BrandLinkInner(opts: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const searchParams = useSearchParams();
  const pilotFocus = isPilotFocusParam(
    searchParams.get("focus") ?? undefined,
  );
  return (
    <Link
      className={opts.className}
      href={withPilotFocus("/", pilotFocus)}
      aria-label={opts["aria-label"]}
    >
      {opts.children}
    </Link>
  );
}

/** Topbar brand — preserves ?focus=pilot like primary Nav. */
export function BrandLink(opts: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Suspense
      fallback={
        <Link
          className={opts.className}
          href="/"
          aria-label={opts["aria-label"]}
        >
          {opts.children}
        </Link>
      }
    >
      <BrandLinkInner {...opts} />
    </Suspense>
  );
}
