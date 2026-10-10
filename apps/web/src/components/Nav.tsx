"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "New run", match: (p: string) => p === "/" },
  { href: "/runs", label: "Runs", match: (p: string) => p.startsWith("/runs") },
  {
    href: "/dashboard",
    label: "Dashboard",
    match: (p: string) => p.startsWith("/dashboard"),
  },
] as const;

export function Nav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="nav" aria-label="Primary">
      {items.map((item) => {
        const current = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
