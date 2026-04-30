import { realpathSync } from "node:fs";
import { basename, normalize, relative, resolve, sep } from "node:path";
import { PilotFlowError } from "../shared/errors.js";

const DENIED_BASENAMES = new Set([".env", ".env.local", ".env.production", ".netrc", ".npmrc"]);
const DENIED_SEGMENTS = new Set([".ssh", ".aws", ".gnupg", ".kube", ".docker"]);
const DENIED_ABSOLUTE_PREFIXES = ["/etc/", "/root/"];

export function isPathSafe(inputPath: string, safeRoot = process.cwd()): boolean {
  const resolvedRaw = resolve(normalize(inputPath));
  const rootRaw = resolve(normalize(safeRoot));
  const resolved = safeRealpath(resolvedRaw);
  const root = safeRealpath(rootRaw);

  const rel = relative(root, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === rel) return false;

  const normalized = resolved.replace(/\\/g, "/").toLowerCase();
  if (DENIED_BASENAMES.has(basename(normalized))) return false;
  if (DENIED_ABSOLUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;

  const segments = normalized.split("/");
  if (segments.some((segment) => DENIED_SEGMENTS.has(segment))) return false;

  return true;
}

export function assertPathSafe(path: string, safeRoot = process.cwd()): void {
  if (!isPathSafe(path, safeRoot)) {
    throw new PilotFlowError(`Blocked write to sensitive path: ${path}`, "WRITE_GUARD_BLOCKED", { path, safeRoot });
  }
}

function safeRealpath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}
