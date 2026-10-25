import {
  type AgentSkillWrapProfile,
  readSkillImportMeta,
  type SkillSummary,
} from "@skillevalator/core";
import { importedSkillsDir } from "@/lib/paths";

export type SkillListEntry = SkillSummary & {
  wrappedFromAgentSkill?: boolean;
  agentWrapProfile?: AgentSkillWrapProfile;
};

/** Attach `.import.json` flags for skills under data/imported-skills. */
export function enrichSkillsWithImportMeta(
  skills: SkillSummary[],
): SkillListEntry[] {
  const impRoot = importedSkillsDir();
  return skills.map((s) => {
    const meta = readSkillImportMeta(impRoot, s.id);
    return meta?.wrappedFromAgentSkill
      ? {
          ...s,
          wrappedFromAgentSkill: true,
          agentWrapProfile: meta.agentWrapProfile,
        }
      : s;
  });
}
