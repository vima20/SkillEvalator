import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";

/** Strip UTF-8 BOM that Windows editors sometimes prepend. */
export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

export function readJsonFile(filePath: string): unknown {
  const text = stripBom(fs.readFileSync(filePath, "utf8"));
  return JSON.parse(text) as unknown;
}

export function readJsonFileAs<Schema extends z.ZodTypeAny>(
  schema: Schema,
  filePath: string,
): z.output<Schema> {
  return schema.parse(readJsonFile(filePath));
}

/** Atomic JSON write: temp file + rename. */
export function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw e;
  }
}
