import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface LoadLocalEnvOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fileName?: string;
}

export function loadLocalEnv(options: LoadLocalEnvOptions = {}): NodeJS.ProcessEnv {
  const cwd = options.cwd ?? process.cwd();
  const env: NodeJS.ProcessEnv = { ...(options.env ?? process.env) };
  const filePath = join(cwd, options.fileName ?? ".env");
  if (!existsSync(filePath)) return env;

  const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}

export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
    result[key] = unquote(trimmed.slice(equals + 1).trim());
  }
  return result;
}

function unquote(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  const commentIndex = value.search(/\s#/u);
  return commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value;
}
