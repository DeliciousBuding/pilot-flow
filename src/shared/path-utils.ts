import { existsSync } from "node:fs";
import { join } from "node:path";

export type PathSegment = string | number;

export function getPath(obj: unknown, path: string | readonly PathSegment[]): unknown {
  const segments: readonly PathSegment[] = typeof path === "string" ? path.split(".").filter(Boolean) : path;
  let current = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object" && !Array.isArray(current)) return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

export interface ResolvedExecutable {
  readonly bin: string;
  readonly argsPrefix: readonly string[];
}

export function resolveExecutable(name: string): ResolvedExecutable {
  if (process.platform !== "win32" || name !== "lark-cli") {
    return { bin: name, argsPrefix: [] };
  }

  const cliScript = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules", "@larksuite", "cli", "scripts", "run.js")
    : undefined;
  if (cliScript && existsSync(cliScript)) {
    return { bin: process.execPath, argsPrefix: [cliScript] };
  }

  return { bin: "cmd.exe", argsPrefix: ["/d", "/s", "/c", "lark-cli.cmd"] };
}
