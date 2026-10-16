/**
 * Safe post-unlock redirect target (relative path only).
 * Preserves `?focus=pilot`; strips other query noise (open-redirect safe).
 */
export function safeUnlockNext(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  if (trimmed.includes("://") || trimmed.includes("\\")) return "/";
  if (trimmed.includes("..")) return "/";

  const q = trimmed.indexOf("?");
  const pathname = q === -1 ? trimmed : trimmed.slice(0, q);
  const search = q === -1 ? "" : trimmed.slice(q + 1);
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/";
  if (pathname === "/unlock" || pathname.startsWith("/unlock/")) return "/";

  if (!search) return pathname;
  const params = new URLSearchParams(search);
  if (params.get("focus") === "pilot") {
    return `${pathname}?focus=pilot`;
  }
  return pathname;
}

/** Build `next` query value from the blocked request URL. */
export function unlockNextFromRequest(
  pathname: string,
  searchParams: { get(name: string): string | null },
): string | null {
  if (!pathname || pathname === "/") return null;
  if (pathname.startsWith("/unlock")) return null;
  if (pathname.includes("..") || pathname.startsWith("//")) return null;
  if (searchParams.get("focus") === "pilot") {
    return `${pathname}?focus=pilot`;
  }
  return pathname;
}
