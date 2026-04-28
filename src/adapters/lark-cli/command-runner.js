import { spawn } from "node:child_process";

export class LarkCliCommandRunner {
  constructor({ dryRun = true } = {}) {
    this.dryRun = dryRun;
  }

  async run(args, { idempotencyKey } = {}) {
    const command = ["lark-cli", ...args];
    if (this.dryRun) {
      return {
        ok: true,
        dry_run: true,
        idempotency_key: idempotencyKey,
        command
      };
    }

    return runProcess("lark-cli", args).then((result) => ({
      ...result,
      idempotency_key: idempotencyKey,
      command
    }));
  }
}

function runProcess(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { shell: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
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
