import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { importSkillsFromGitHub } from "@skillevalator/core";
import { importedSkillsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  url: z.string().min(3).max(500),
  ref: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const result = await importSkillsFromGitHub({
      url: body.url,
      ref: body.ref,
      importedSkillsDir: importedSkillsDir(),
    });
    return NextResponse.json({
      ok: true,
      owner: result.ref.owner,
      repo: result.ref.repo,
      ref: result.ref.ref,
      pageUrl: result.ref.pageUrl,
      skills: result.skills,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid request", details: err.flatten() },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "import failed";
    const status =
      message.includes("required") ||
      message.includes("invalid") ||
      message.includes("only github") ||
      message.includes("No SkillEvalator") ||
      message.includes("not found")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
