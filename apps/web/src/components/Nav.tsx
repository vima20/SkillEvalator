"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  isPilotFocusParam,
  listNewRunHref,
  withPilotFocus,
} from "@/lib/pilotFocusHref";

const items = [
  { href: "/", label: "New run", match: (p: string) => p === "/" },
  { href: "/runs", label: "Runs", match: (p: string) => p.startsWith("/runs") },
  {
    href: "/comparison",
    label: "Comparison",
    match: (p: string) => p.startsWith("/comparison"),
  },
  {
    href: "/benefit",
    label: "Benefit",
    match: (p: string) => p.startsWith("/benefit"),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    match: (p: string) => p.startsWith("/dashboard"),
  },
  {
    href: "/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/settings"),
  },
] as const;

function NavLinks() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const pilotFocus = isPilotFocusParam(searchParams.get("focus") ?? undefined);

  return (
    <>
      {items.map((item) => {
        const current = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={
              item.href === "/"
                ? listNewRunHref(pilotFocus)
                : withPilotFocus(item.href, pilotFocus)
            }
            aria-current={current ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

/** Primary nav — preserves ?focus=pilot across tabs when set. */
export function Nav() {
  return (
    <nav className="nav" aria-label="Primary">
      <Suspense
        fallback={items.map((item) => (
          // Non-navigable until searchParams hydrate — avoids dropping focus.
          <span key={item.href}>{item.label}</span>
        ))}
      >
        <NavLinks />
      </Suspense>
    </nav>
  );
}
