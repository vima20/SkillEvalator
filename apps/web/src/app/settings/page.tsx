import { Suspense } from "react";
import { healOrphansForBrowse } from "@/lib/healOrphans";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Browse heal on first paint — same as list/preflight (keep wind-down Cancel).
  // Full heal is Settings Refresh → GET /api/settings?heal=1.
  healOrphansForBrowse();
  const initial = loadSettingsSnapshot();
  return (
    <Suspense fallback={<p className="hint">Loading settings…</p>}>
      <SettingsClient initial={initial} />
    </Suspense>
  );
}
