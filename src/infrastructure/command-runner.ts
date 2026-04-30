import { spawn } from "node:child_process";
import type { LarkCliResult } from "../types/feishu.js";
import { resolveExecutable } from "../shared/path-utils.js";
import { redactArgs } from "../safety/redact.js";
import { CommandFailedError, CommandTimeoutError } from "../shared/errors.js";

export interface RunOptions {
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly dryRun?: boolean;
  readonly profile?: string;
}

export interface CommandResult extends LarkCliResult {
  readonly ok: boolean;
  readonly exit_code: number | null;
  readonly command: readonly string[];
  readonly dry_run?: boolean;
}

export async function runCommand(bin: string, args: readonly string[], options: RunOptions = {}): Promise<CommandResult> {
  const effectiveArgs = options.profile ? ["--profile", options.profile, ...args] : [...args];
  const resolved = resolveExecutable(bin);
  const command = [resolved.bin, ...redactArgs([...resolved.argsPrefix, ...effectiveArgs])];

  if (options.dryRun) {
    return {
      ok: true,
      dry_run: true,
      exitCode: 0,
      exit_code: 0,
      stdout: "",
      stderr: "",
      command,
    };
  }

  validateCommandArgs(resolved.argsPrefix, resolved.bin);
  validateCommandArgs(effectiveArgs, resolved.bin);

  return runProcess(resolved.bin, [...resolved.argsPrefix, ...effectiveArgs], {
    timeoutMs: options.timeoutMs ?? 30_000,
    maxOutputBytes: options.maxOutputBytes ?? 1_048_576,
    command,
  });
}

async function runProcess(
  bin: string,
  args: readonly string[],
  options: { readonly timeoutMs: number; readonly maxOutputBytes: number; readonly command: readonly string[] },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new CommandTimeoutError(`Command timed out after ${options.timeoutMs}ms`, { command: options.command }));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const next = stdout + chunk.toString("utf8");
      if (next.length > options.maxOutputBytes) {
        stdout = next.slice(0, options.maxOutputBytes);
        truncated = true;
      } else {
        stdout = next;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const next = stderr + chunk.toString("utf8");
      if (next.length > options.maxOutputBytes) {
        stderr = next.slice(0, options.maxOutputBytes);
        truncated = true;
      } else {
        stderr = next;
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new CommandFailedError(error.message, { command: options.command }));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result: CommandResult = {
        ok: code === 0,
        exitCode: code ?? 1,
        exit_code: code,
        stdout,
        stderr,
        json: parseJson(stdout),
        command: options.command,
        truncated,
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      reject(
        new CommandFailedError(stderr.trim() || stdout.trim() || `Command exited with ${code}`, {
          command: options.command,
          exitCode: code,
          stdout: redactProcessOutput(stdout),
          stderr: redactProcessOutput(stderr),
        }),
      );
    });
  });
}

function redactProcessOutput(output: string): string {
  return output
    .slice(0, 2_000)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[REDACTED]")
    .replace(/(app_secret|client_secret|secret|token|api_key)["'=:\s]+[A-Za-z0-9._~+/=-]{8,}/gi, "$1=[REDACTED]");
}

export function parseJson(stdout: string): Record<string, unknown> | undefined {
  let text = stdout.trim();
  if (!text) return undefined;
  const firstObjectIndex = text.search(/[\[{]/);
  if (firstObjectIndex > 0) text = text.slice(firstObjectIndex);
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return undefined;
  }
}

function validateCommandArgs(args: readonly string[], bin: string): void {
  if (process.platform !== "win32") return;
  const cmdFallback = bin.toLowerCase().endsWith("cmd.exe");
  for (const arg of args) {
    if (/[\r\n]/.test(arg)) {
      throw new CommandFailedError("Unsafe command argument contains a newline", { arg: "<redacted>" });
    }
    if (cmdFallback && /[&|<>^%]/.test(arg)) {
      throw new CommandFailedError("Unsafe command argument contains a Windows shell metacharacter", { arg: "<redacted>" });
    }
  }
}
