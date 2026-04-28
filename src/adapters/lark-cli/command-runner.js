import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export class LarkCliCommandRunner {
  constructor({ dryRun = true, profile } = {}) {
    this.dryRun = dryRun;
    this.profile = profile;
  }

  async run(args, { idempotencyKey } = {}) {
    const effectiveArgs = this.profile ? ["--profile", this.profile, ...args] : args;
    const command = ["lark-cli", ...redactArgs(effectiveArgs)];
    if (this.dryRun) {
      return {
        ok: true,
        dry_run: true,
        idempotency_key: idempotencyKey,
        command
      };
    }

    const result = await runProcess("lark-cli", effectiveArgs);
    if (!result.ok) {
      const message = result.stderr.trim() || result.stdout.trim() || `lark-cli exited with ${result.exit_code}`;
      const error = new Error(message);
      error.result = { ...result, command };
      throw error;
    }

    return {
      ...result,
      json: parseJson(result.stdout),
      idempotency_key: idempotencyKey,
      command
    };
  }
}

function runProcess(bin, args) {
  return new Promise((resolve) => {
    const command = resolveExecutable(bin, args);
    let stdout = "";
    let stderr = "";
    let child;

    try {
      child = spawn(command.bin, command.args, { shell: false });
    } catch (error) {
      resolve({
        ok: false,
        exit_code: null,
        stdout,
        stderr: error.message
      });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        exit_code: null,
        stdout,
        stderr: error.message
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        exit_code: code,
        stdout,
        stderr
      });
    });
  });
}

function resolveExecutable(bin, args) {
  if (process.platform !== "win32" || bin !== "lark-cli") {
    return { bin, args };
  }

  const cliScript = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules", "@larksuite", "cli", "scripts", "run.js")
    : undefined;
  if (cliScript && existsSync(cliScript)) {
    return {
      bin: "node",
      args: [cliScript, ...args]
    };
  }

  return {
    bin: "cmd.exe",
    args: ["/d", "/s", "/c", "lark-cli.cmd", ...args]
  };
}

function parseJson(stdout) {
  const text = stdout.trim();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function redactArgs(args) {
  const redactedValueFlags = new Set(["--base-token", "--chat-id", "--user-id"]);
  const redacted = [];

  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    redacted.push(item);

    if (redactedValueFlags.has(item) && index + 1 < args.length) {
      redacted.push("<redacted>");
      index += 1;
    }
  }

  return redacted;
}
