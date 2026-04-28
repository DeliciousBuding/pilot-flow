import { resolve } from "node:path";
import { DEFAULT_DUPLICATE_GUARD_PATH } from "../core/orchestrator/duplicate-run-guard.js";

const CONFIRMATION_PHRASE = "确认起飞";

export function loadRuntimeConfig(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  if (args.help || args.h) {
    return { help: true, usage: buildUsage() };
  }

  const mode = resolveMode(args, env);
  const dryRun = mode !== "live";
  const confirmationText = stringValue(args.confirm) || env.PILOTFLOW_CONFIRMATION_TEXT || "";

  return {
    mode,
    dryRun,
    profile: stringValue(args.profile) || env.PILOTFLOW_LARK_PROFILE || "pilotflow-contest",
    inputPath: resolve(stringValue(args.input) || "src/demo/fixtures/demo_input_project_init.txt"),
    outputPath: resolve(stringValue(args.output) || "tmp/runs/latest-manual-run.jsonl"),
    planCard: {
      send: booleanValue(args["send-plan-card"]) || booleanEnv(env.PILOTFLOW_SEND_PLAN_CARD)
    },
    entryMessage: {
      send: booleanValue(args["send-entry-message"]) || booleanEnv(env.PILOTFLOW_SEND_ENTRY_MESSAGE)
    },
    riskCard: {
      send: booleanValue(args["send-risk-card"]) || booleanEnv(env.PILOTFLOW_SEND_RISK_CARD)
    },
    duplicateGuard: {
      enabled: mode === "live" && !booleanValue(args["disable-duplicate-guard"]) && !booleanEnv(env.PILOTFLOW_DISABLE_DUPLICATE_GUARD),
      allowDuplicate: booleanValue(args["allow-duplicate-run"]) || booleanEnv(env.PILOTFLOW_ALLOW_DUPLICATE_RUN),
      key: stringValue(args["dedupe-key"]) || env.PILOTFLOW_DEDUPE_KEY || "",
      filePath: resolve(stringValue(args["duplicate-guard-path"]) || env.PILOTFLOW_DUPLICATE_GUARD_PATH || DEFAULT_DUPLICATE_GUARD_PATH)
    },
    confirmation: {
      expectedText: CONFIRMATION_PHRASE,
      text: confirmationText,
      autoConfirm: dryRun ? args["no-auto-confirm"] !== true : confirmationText === CONFIRMATION_PHRASE
    },
    feishu: {
      chatId: stringValue(args["chat-id"]) || env.PILOTFLOW_TEST_CHAT_ID,
      baseToken: stringValue(args["base-token"]) || env.PILOTFLOW_BASE_TOKEN,
      baseTableId: stringValue(args["base-table-id"]) || env.PILOTFLOW_BASE_TABLE_ID,
      tasklistId: stringValue(args["tasklist-id"]) || env.PILOTFLOW_TASKLIST_ID
    }
  };
}

function resolveMode(args, env) {
  if (args.live === true) return "live";
  if (args["dry-run"] === true) return "dry-run";

  const mode = stringValue(args.mode) || env.PILOTFLOW_FEISHU_MODE || "dry-run";
  if (!["dry-run", "live"].includes(mode)) {
    throw new Error(`Unsupported PILOTFLOW_FEISHU_MODE: ${mode}`);
  }
  return mode;
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      throw new Error(`Unexpected argument: ${item}`);
    }

    const eqIndex = item.indexOf("=");
    if (eqIndex !== -1) {
      result[item.slice(2, eqIndex)] = item.slice(eqIndex + 1);
      continue;
    }

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function buildUsage() {
  return `Usage:
  npm run demo:manual
  npm run demo:manual -- --live --confirm "确认起飞"

Options:
  --dry-run                 Build lark-cli commands without writing to Feishu.
  --live                    Execute lark-cli commands against Feishu.
  --send-plan-card          Send or dry-run the project flight plan card before confirmation.
  --send-entry-message      Send or dry-run a project entry message after Doc/Base/Task artifacts are created.
  --send-risk-card          Send or dry-run a risk decision card after state rows are created.
  --dedupe-key <key>        Optional stable key for live duplicate-run protection.
  --allow-duplicate-run     Bypass duplicate-run protection for intentional repeated live writes.
  --disable-duplicate-guard Disable live duplicate-run protection.
  --duplicate-guard-path <path>  Local duplicate-run guard file. Defaults to ${DEFAULT_DUPLICATE_GUARD_PATH}.
  --confirm <text>          Live writes require the exact phrase: ${CONFIRMATION_PHRASE}
  --profile <name>          lark-cli profile. Defaults to pilotflow-contest.
  --chat-id <oc_xxx>        Target Feishu group chat for final summary.
  --base-token <token>      Target Base token for state records.
  --base-table-id <tbl_xxx> Target Base table for state records.
  --tasklist-id <guid/url>  Optional Task tasklist.
  --input <path>            Input fixture path.
  --output <path>           JSONL run log path.
`;
}

function booleanValue(value) {
  return value === true || value === "true" || value === "1";
}

function booleanEnv(value) {
  return value === "true" || value === "1";
}
