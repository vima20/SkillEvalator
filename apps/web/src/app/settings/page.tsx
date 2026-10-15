import { loadSettingsSnapshot } from "@/lib/settingsSnapshot";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const initial = loadSettingsSnapshot();
  return <SettingsClient initial={initial} />;
}
