import fs from "node:fs";

export function readJsonFile<T>(filePath: string): T {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text) as T;
}
