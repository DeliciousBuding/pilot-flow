import { LarkCliCommandRunner } from "../adapters/lark-cli/command-runner.js";
import { PROJECT_STATE_FIELD_DEFINITIONS } from "../core/orchestrator/project-state-builder.js";

const CONFIRMATION_TEXT = "创建PilotFlow测试Base";

const config = parseArgs(process.argv.slice(2));

if (config.help) {
  console.log(buildUsage());
  process.exit(0);
}

if (!config.dryRun && config.confirm !== CONFIRMATION_TEXT) {
  console.error(
    JSON.stringify(
      {
        status: "waiting_confirmation",
        expected_confirmation_text: CONFIRMATION_TEXT
      },
      null,
      2
    )
  );
  process.exit(0);
}

const runner = new LarkCliCommandRunner({
  dryRun: config.dryRun,
  profile: config.profile
});

const baseName = config.name || `PilotFlow Demo State ${new Date().toISOString().slice(0, 10)}`;
const fields = PROJECT_STATE_FIELD_DEFINITIONS;

const baseResult = await runner.run(
  ["base", "+base-create", "--as", "user", "--name", baseName],
  { idempotencyKey: `setup-base:${baseName}` }
);
const baseToken = extractBaseToken(baseResult) || (config.dryRun ? "<base-token>" : undefined);

if (!baseToken && !config.dryRun) {
  throw new Error("Base created but response did not include a base token");
}

let tableResult;
let tableId;
if (baseToken) {
  tableResult = await runner.run(
    [
      "base",
      "+table-create",
      "--as",
      "user",
      "--base-token",
      baseToken,
      "--name",
      "Project State",
      "--fields",
      JSON.stringify(fields)
    ],
    { idempotencyKey: `setup-table:${baseToken}:project-state` }
  );
  tableId = extractTableId(tableResult) || (config.dryRun ? "<table-id>" : undefined);
}

console.log(
  JSON.stringify(
    {
      status: config.dryRun ? "planned" : "created",
      profile: config.profile,
      base: normalizeBase(baseResult),
      table: tableResult ? normalizeTable(tableResult) : undefined,
      env: baseToken
        ? {
            PILOTFLOW_LARK_PROFILE: config.profile,
            PILOTFLOW_BASE_TOKEN: baseToken,
            PILOTFLOW_BASE_TABLE_ID: tableId || "<table-id>",
            PILOTFLOW_TEST_CHAT_ID: config.chatId || "<oc_xxx>"
          }
        : undefined
    },
    null,
    2
  )
);

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
    dryRun: args["dry-run"] === true,
    profile: typeof args.profile === "string" ? args.profile : process.env.PILOTFLOW_LARK_PROFILE || "pilotflow-contest",
    confirm: typeof args.confirm === "string" ? args.confirm : "",
    name: typeof args.name === "string" ? args.name : undefined,
    chatId: typeof args["chat-id"] === "string" ? args["chat-id"] : process.env.PILOTFLOW_TEST_CHAT_ID
  };
}

function buildUsage() {
  return `Usage:
  npm run setup:feishu -- --dry-run
  npm run setup:feishu -- --confirm "${CONFIRMATION_TEXT}" --chat-id oc_xxx

Options:
  --dry-run          Build expected setup commands without writing to Feishu.
  --confirm <text>   Live setup requires: ${CONFIRMATION_TEXT}
  --profile <name>   lark-cli profile, default pilotflow-contest.
  --name <text>      Base name.
  --chat-id <oc_xxx> Optional test group chat ID to include in printed env.
`;
}

function extractBaseToken(result) {
  const base = result.json?.data?.base || result.json?.base || result.json?.data || {};
  return base.app_token || base.base_token || base.token;
}

function extractTableId(result) {
  const table = result.json?.data?.table || result.json?.table || result.json?.data || {};
  return table.table_id || table.id;
}

function normalizeBase(result) {
  const base = result.json?.data?.base || result.json?.base || result.json?.data || {};
  return clean({
    token: base.app_token || base.base_token || base.token,
    name: base.name,
    url: base.url,
    command: result.command
  });
}

function normalizeTable(result) {
  const table = result.json?.data?.table || result.json?.table || result.json?.data || {};
  return clean({
    table_id: table.table_id || table.id,
    name: table.name,
    command: result.command
  });
}

function clean(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}
