import { NextResponse } from "next/server";
import { listSkills } from "@skillevalator/core";
import { allSkillsDirs } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ skills: listSkills(allSkillsDirs()) });
}
