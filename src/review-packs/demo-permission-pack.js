import { exec, execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const LARK_CLI_BIN = "lark-cli";

const REQUIRED_SCOPE_GROUPS = [
  {
    surface: "IM and group entry",
    scopes: ["im:message", "im:chat:read", "im:message.pins:write_only"],
    reason: "Send summaries, read target chat metadata, and pin the project entry message."
  },
  {
    surface: "Docs",
    scopes: ["docx:document:create", "docs:document.content:read", "docx:document:write_only"],
    reason: "Create and update the generated project brief."
  },
  {
    surface: "Base",
    scopes: ["base:app:read", "base:record:create", "base:record:read", "base:field:read"],
    reason: "Write and verify Project State rows."
  },
  {
    surface: "Task",
    scopes: ["task:task:write", "task:task:read"],
    reason: "Create and show native task artifacts."
  },
  {
    surface: "Contacts owner lookup",
    scopes: ["contact:user:search", "contact:user.base:readonly"],
    reason: "Optionally resolve owner labels to Feishu users."
  },
  {
    surface: "Event callback",
    scopes: ["docs:event:subscribe"],
    reason: "Support event subscription capability while card callback delivery is being configured."
  }
];

const SCREENSHOT_ITEMS = [
  {
    title: "App basic information",
    surface: "Feishu Open Platform console",
    capture: "App name, app ID, tenant context, and bot enabled state.",
    redaction: "Hide App Secret, verification token, encrypt key, and webhook secrets."
  },
  {
    title: "Permission scopes",
    surface: "Feishu Open Platform console",
    capture: "Scopes for IM, Docs, Base, Task, Contacts, and event subscription.",
    redaction: "Do not expose tokens or unrelated private tenant data."
  },
  {
    title: "Bot in test group",
    surface: "Feishu test group",
    capture: "PilotFlow app/bot present in the target demo group.",
    redaction: "Hide unrelated member names if needed."
  },
  {
    title: "Card callback / event configuration",
    surface: "Open Platform event or callback settings",
    capture: "`card.action.trigger` configuration or the current missing/blocked state.",
    redaction: "Hide request URLs, verification tokens, encrypt keys, and server secrets."
  },
  {
    title: "Bounded listener result",
    surface: "Terminal or generated report",
    capture: "Listener connects or dry-run event subscription command is valid.",
    redaction: "Show only sanitized app ID/profile and no access tokens."
  }
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoPermissionPack(config);
  const markdown = renderDemoPermissionMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        profile: pack.profile,
        auth_status: pack.auth.status,
        event_dry_run_status: pack.eventDryRun.status,
        screenshot_count: pack.screenshotItems.length
      },
      null,
      2
    )
  );
}

export async function buildDemoPermissionPack({
  profile = "pilotflow-contest",
  authStatusJson = "",
  listenerLog = "tmp/runs/latest-card-listener.jsonl",
  collectAuth = false,
  collectVersion = false,
  collectEventDryRun = false,
  output = "tmp/demo-permissions/PERMISSION_APPENDIX.md"
} = {}) {
  const rawAuth = collectAuth ? await collectAuthStatus(profile) : await readAuthStatus(authStatusJson);
  const cliVersion = collectVersion ? await collectLarkCliVersion() : "";
  const eventDryRun = collectEventDryRun ? await collectEventSubscribeDryRun(profile) : { status: "not_collected", summary: "Run with --collect-event-dry-run to validate the bot dry-run command." };
  const listener = await inspectListenerLog(listenerLog);
  const sanitizedAuth = sanitizeAuthStatus(rawAuth);

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    profile,
    cliVersion: cliVersion || "not collected",
    auth: sanitizedAuth,
    scopeGroups: REQUIRED_SCOPE_GROUPS.map((group) => ({
      ...group,
      status: group.scopes.every((scope) => sanitizedAuth.scopeSet.has(scope)) ? "covered" : "missing",
      missing: group.scopes.filter((scope) => !sanitizedAuth.scopeSet.has(scope))
    })),
    eventDryRun,
    listener,
    screenshotItems: SCREENSHOT_ITEMS,
    boundaries: buildBoundaries()
  };
}

export function renderDemoPermissionMarkdown(pack) {
  const lines = [
    "# PilotFlow Permission Appendix Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Profile: \`${pack.profile}\``,
    `- lark-cli: \`${pack.cliVersion}\``,
    "",
    "## Safe CLI Evidence",
    "",
    "| Evidence | Status | Notes |",
    "| --- | --- | --- |",
    `| User auth verification | ${pack.auth.status} | ${escapeCell(pack.auth.summary)} |`,
    `| Event subscribe dry-run | ${pack.eventDryRun.status} | ${escapeCell(pack.eventDryRun.summary)} |`,
    `| Bounded listener evidence | ${pack.listener.status} | ${escapeCell(pack.listener.summary)} |`,
    "",
    "## Scope Coverage Matrix",
    "",
    "| Surface | Status | Scopes | Missing | Why it matters |",
    "| --- | --- | --- | --- | --- |",
    ...pack.scopeGroups.map((group) => `| ${group.surface} | ${group.status} | ${group.scopes.map((scope) => `\`${scope}\``).join("<br>")} | ${group.missing.length > 0 ? group.missing.map((scope) => `\`${scope}\``).join("<br>") : "None"} | ${escapeCell(group.reason)} |`),
    "",
    "## Required Screenshots",
    "",
    "| Screenshot | Surface | Capture | Redaction rule |",
    "| --- | --- | --- | --- |",
    ...pack.screenshotItems.map((item) => `| ${item.title} | ${item.surface} | ${escapeCell(item.capture)} | ${escapeCell(item.redaction)} |`),
    "",
    "## Callback Configuration Checklist",
    "",
    "- [ ] Confirm the app/bot is installed in the target test group.",
    "- [ ] Confirm message card button values include `pilotflow_card`, `pilotflow_run_id`, and `pilotflow_action`.",
    "- [ ] Confirm the event or callback configuration includes `card.action.trigger`.",
    "- [ ] Run a bounded listener and save the result.",
    "- [ ] Keep text confirmation as the stable fallback until a real callback event is captured.",
    "",
    "## Demo Boundary",
    "",
    ...pack.boundaries.map((item) => `- ${item}`)
  ];

  return `${lines.join("\n")}\n`;
}

async function collectAuthStatus(profile) {
  const result = await runLarkCli(["auth", "status", "--verify", "--profile", profile], 1024 * 1024 * 4);
  return parseJsonObject(result.stdout);
}

async function collectLarkCliVersion() {
  const result = await runLarkCli(["--version"], 1024 * 128);
  return result.stdout.trim();
}

async function collectEventSubscribeDryRun(profile) {
  try {
    const result = await runLarkCli(["event", "+subscribe", "--dry-run", "--event-types", "card.action.trigger", "--profile", profile, "--as", "bot"], 1024 * 1024);
    const text = result.stdout.trim();
    const ok = /card\.action\.trigger/.test(text) && /event \+subscribe/.test(text);
    return {
      status: ok ? "ready" : "needs_review",
      summary: ok ? "Bot dry-run command accepts `card.action.trigger`." : "Dry-run completed but expected callback markers were not found."
    };
  } catch (error) {
    return {
      status: "failed",
      summary: summarizeError(error.stdout || error.stderr || error.message)
    };
  }
}

async function runLarkCli(args, maxBuffer) {
  if (process.platform !== "win32") {
    return execFileAsync(LARK_CLI_BIN, args, {
      windowsHide: true,
      maxBuffer
    });
  }

  return execAsync([LARK_CLI_BIN, ...args.map(quoteCmdArg)].join(" "), {
    windowsHide: true,
    maxBuffer
  });
}

function quoteCmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:+-]+$/.test(text)) return text;
  return `"${text.replaceAll('"', '\\"')}"`;
}

async function readAuthStatus(authStatusJson) {
  if (!authStatusJson) return null;
  const text = await readFile(resolve(authStatusJson), "utf8");
  return parseJsonObject(text);
}

function sanitizeAuthStatus(rawAuth) {
  if (!rawAuth) {
    return {
      status: "not_collected",
      summary: "Run with --collect-auth to include a sanitized auth summary.",
      appId: "",
      brand: "",
      identity: "",
      tokenStatus: "",
      verified: false,
      scopeSet: new Set()
    };
  }

  const scopes = String(rawAuth.scope || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const scopeSet = new Set(scopes);
  const tokenStatus = rawAuth.tokenStatus || "unknown";
  const verified = rawAuth.verified === true;

  return {
    status: verified ? "verified" : "needs_attention",
    summary: `brand=${rawAuth.brand || "unknown"}, identity=${rawAuth.identity || "unknown"}, tokenStatus=${tokenStatus}, scopeCount=${scopes.length}`,
    appId: rawAuth.appId || "",
    brand: rawAuth.brand || "",
    identity: rawAuth.identity || "",
    tokenStatus,
    verified,
    scopeSet
  };
}

async function inspectListenerLog(listenerLog) {
  const text = await readOptionalText(resolve(listenerLog));
  if (!text) {
    return {
      status: "not_collected",
      summary: "No bounded listener log found."
    };
  }

  const connected = /Connected\./.test(text);
  const noEvents = /"event_count"\s*:\s*0/.test(text);
  const callbackMentioned = /card\.action\.trigger/.test(text);

  if (connected && noEvents) {
    return {
      status: "connected_no_callback",
      summary: callbackMentioned
        ? "Listener connected for `card.action.trigger`, but no callback event arrived in the bounded window."
        : "Listener connected, but no callback event arrived in the bounded window."
    };
  }

  return {
    status: connected ? "connected" : "needs_review",
    summary: "Listener log exists; inspect it before claiming callback delivery."
  };
}

function buildBoundaries() {
  return [
    "This appendix is a permission and callback evidence plan, not proof that screenshots already exist.",
    "Do not show App Secret, access tokens, verification tokens, encrypt keys, webhook URLs, or private contact details.",
    "A valid event subscribe dry-run proves command readiness, not end-to-end card callback delivery.",
    "Keep real card callback delivery marked pending until a `card.action.trigger` event is captured.",
    "The current group announcement path remains documented as attempted with pinned-entry fallback."
  ];
}

async function readOptionalText(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseJsonObject(text = "") {
  const trimmed = String(text).trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return JSON.parse(trimmed.slice(start, end + 1));
}

function summarizeError(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

function escapeCell(value = "") {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function parseArgs(argv) {
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
    help: args.help === true || args.h === true,
    profile: typeof args.profile === "string" ? args.profile : "pilotflow-contest",
    authStatusJson: typeof args["auth-status-json"] === "string" ? args["auth-status-json"] : "",
    listenerLog: typeof args["listener-log"] === "string" ? args["listener-log"] : "tmp/runs/latest-card-listener.jsonl",
    collectAuth: args["collect-auth"] === true,
    collectVersion: args["collect-version"] === true,
    collectEventDryRun: args["collect-event-dry-run"] === true,
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-permissions/PERMISSION_APPENDIX.md")
  };
}

function buildUsage() {
  return `Usage:
  npm run review:permissions
  npm run review:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX.md

Options:
  --profile <profile>              lark-cli profile, default: pilotflow-contest.
  --auth-status-json <path>        Optional raw auth status JSON to sanitize.
  --listener-log <path>            Bounded listener JSONL log.
  --collect-version                Collect sanitized lark-cli version.
  --collect-auth                   Collect and sanitize lark-cli auth status.
  --collect-event-dry-run          Run bot event subscribe dry-run for card.action.trigger.
  --output <path>                  Permission appendix markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
