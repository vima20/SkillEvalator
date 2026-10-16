import { Suspense } from "react";
import { healOrphanStatuses } from "@/lib/healOrphans";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Same as Dashboard / preflight: reclaim orphan .running.json before Ready.
  healOrphanStatuses();
  const initial = loadSettingsSnapshot();
  return (
    <Suspense fallback={<p className="hint">Loading settings…</p>}>
      <SettingsClient initial={initial} />
    </Suspense>
  );
}
