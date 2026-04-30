import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_REQUIRED_ENV = [
  "PILOTFLOW_LARK_PROFILE",
  "PILOTFLOW_TEST_CHAT_ID",
  "PILOTFLOW_BASE_TOKEN",
  "PILOTFLOW_BASE_TABLE_ID"
];

if (isMainModule()) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const config = parseArgs(argv, env);
  const report = await buildDoctorReport(config, env);
  console.log(renderDoctorReport(report));
  if (report.summary.failed > 0) process.exitCode = 1;
}

export async function buildDoctorReport(config = {}, env = process.env) {
  const profile = config.profile || env.PILOTFLOW_LARK_PROFILE || "pilotflow-contest";
  const checks = [];

  checks.push(checkNodeVersion(process.version));
  checks.push(await checkCommandVersion("lark-cli", ["--version"]));
  checks.push(await checkEnvIgnored());
  checks.push(checkRequiredEnv(config.requiredEnv || DEFAULT_REQUIRED_ENV, env));
  checks.push(await checkLarkAuth(profile, config.verifyAuth));

  return {
    generatedAt: new Date().toISOString(),
    profile,
    checks,
    summary: {
      passed: checks.filter((item) => item.status === "pass").length,
      warned: checks.filter((item) => item.status === "warn").length,
      failed: checks.filter((item) => item.status === "fail").length
    }
  };
}

export function renderDoctorReport(report) {
  const lines = [
    "PilotFlow Doctor",
    `Generated: ${report.generatedAt}`,
    `Profile: ${report.profile}`,
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...report.checks.map((item) => `| ${item.name} | ${item.status} | ${escapeCell(item.detail)} |`),
    "",
    `Summary: ${report.summary.passed} passed, ${report.summary.warned} warned, ${report.summary.failed} failed.`
  ];

  return lines.join("\n");
}

function checkNodeVersion(version) {
  const major = Number(version.replace(/^v/, "").split(".")[0]);
  return {
    name: "Node.js",
    status: major >= 20 ? "pass" : "fail",
    detail: `${version}; expected >=20`
  };
}

async function checkCommandVersion(command, args) {
  const result = await runCommand(platformCommand(command), args);
  return {
    name: command,
    status: result.ok ? "pass" : "fail",
    detail: result.ok ? sanitizeSingleLine(result.stdout || result.stderr || "installed") : "not available or failed to run"
  };
}

async function checkEnvIgnored() {
  const result = await runCommand("git", ["check-ignore", "-q", ".env"]);
  return {
    name: ".env ignored",
    status: result.code === 0 ? "pass" : "fail",
    detail: result.code === 0 ? ".env is ignored by Git" : ".env is not ignored by Git"
  };
}

function checkRequiredEnv(names, env) {
  const missing = names.filter((name) => !env[name]);
  return {
    name: "runtime env names",
    status: missing.length === 0 ? "pass" : "warn",
    detail: missing.length === 0 ? "all required names are present" : `missing: ${missing.join(", ")}`
  };
}

async function checkLarkAuth(profile, verifyAuth) {
  if (!verifyAuth) {
    return {
      name: "lark auth",
      status: "warn",
      detail: "skipped; pass --verify-auth to check token status without printing secrets"
    };
  }

  const result = await runCommand(platformCommand("lark-cli"), ["auth", "status", "--verify", "--profile", profile, "--format", "json"]);
  return {
    name: "lark auth",
    status: result.ok ? "pass" : "warn",
    detail: result.ok ? summarizeAuthStatus(result.stdout) : `auth check failed for profile ${profile}`
  };
}

function summarizeAuthStatus(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    const tokenStatus = parsed.tokenStatus || parsed.data?.tokenStatus || "verified";
    const scopeCount = Array.isArray(parsed.scopes) ? parsed.scopes.length : Array.isArray(parsed.data?.scopes) ? parsed.data.scopes.length : "unknown";
    return `tokenStatus=${tokenStatus}; scopes=${scopeCount}`;
  } catch {
    return "auth command completed";
  }
}

function parseArgs(argv, env) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }

  return {
    profile: typeof args.profile === "string" ? args.profile : env.PILOTFLOW_LARK_PROFILE,
    verifyAuth: args["verify-auth"] === true,
    requiredEnv:
      typeof args["required-env"] === "string"
        ? args["required-env"].split(",").map((item) => item.trim()).filter(Boolean)
        : DEFAULT_REQUIRED_ENV
  };
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const commandToRun = process.platform === "win32" ? "cmd.exe" : command;
    const argsToRun = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
    const child = spawn(commandToRun, argsToRun, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ ok: false, code: -1, stdout, stderr, error });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

function platformCommand(command) {
  if (process.platform !== "win32") return command;
  if (command === "lark-cli") return "lark-cli.cmd";
  if (command === "npm") return "npm.cmd";
  return command;
}

function sanitizeSingleLine(value) {
  return String(value).split(/\r?\n/).find(Boolean)?.trim() || "available";
}

function escapeCell(value = "") {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
