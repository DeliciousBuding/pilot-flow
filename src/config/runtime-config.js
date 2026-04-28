import { resolve } from "node:path";

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
