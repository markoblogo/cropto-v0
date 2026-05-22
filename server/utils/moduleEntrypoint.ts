import path from "path";
import { fileURLToPath } from "url";

export function isDirectEntrypoint(importMetaUrl: string, argvEntry: string | undefined, entryNames: string[]): boolean {
  if (!argvEntry) return false;

  let modulePath: string;
  try {
    modulePath = fileURLToPath(importMetaUrl);
  } catch {
    return false;
  }

  if (path.resolve(modulePath) !== path.resolve(argvEntry)) return false;

  const moduleName = path.basename(modulePath).replace(/\.[cm]?[jt]s$/, "");
  return entryNames.includes(moduleName);
}
