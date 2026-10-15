import { Suspense } from "react";
import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const initial = loadSettingsSnapshot();
  return (
    <Suspense fallback={<p className="hint">Loading settings…</p>}>
      <SettingsClient initial={initial} />
    </Suspense>
  );
}
