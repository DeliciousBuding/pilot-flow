import { resolve } from "node:path";
import { JsonlRecorder } from "../core/recorder/jsonl-recorder.js";
import { CardEventListener } from "../core/events/card-event-listener.js";
import { triggerRunFromCallback } from "../core/events/callback-run-trigger.js";

const config = loadListenerConfig();

if (config.help) {
  printUsage();
  process.exit(0);
}

process.stderr.write(`[PilotFlow] Card Event Listener starting...\n`);
process.stderr.write(`  Profile: ${config.profile}\n`);
process.stderr.write(`  Mode: ${config.dryRun ? "dry-run" : "live"}\n`);
process.stderr.write(`  Output: ${config.outputPath}\n`);
process.stderr.write(`  Input:  ${config.inputPath}\n`);
process.stderr.write(`  Max events: ${config.maxEvents || "unlimited"}\n`);
process.stderr.write(`  Timeout: ${config.timeoutMs ? `${config.timeoutMs}ms` : "unlimited"}\n`);
process.stderr.write(`  Waiting for card.action.trigger events...\n`);

const recorder = new JsonlRecorder(config.outputPath);
const listenerRunId = `card-listener-${Date.now()}`;

function recordSafely(event) {
  void recorder.record({ run_id: listenerRunId, ...event }).catch((error) => {
    process.stderr.write(`[recorder] ${error.message}\n`);
  });
}

const listener = new CardEventListener({
  profile: config.profile,
  dryRun: config.dryRun,
  maxEvents: config.maxEvents,
  timeoutMs: config.timeoutMs,
  onEvent(listenerEvent) {
    if (listenerEvent.type === "event_received") {
      process.stderr.write(`[event] ${listenerEvent.event_type}\n`);
    } else if (listenerEvent.type === "lark_cli_stderr") {
      process.stderr.write(`[lark-cli] ${listenerEvent.message}\n`);
    } else if (listenerEvent.type === "parse_error") {
      process.stderr.write(`[parse_error] ${listenerEvent.raw}\n`);
    } else if (listenerEvent.type === "listener_timeout") {
      process.stderr.write(`[timeout] ${listenerEvent.timeout_ms}ms reached\n`);
    } else if (listenerEvent.type === "listener_max_events_reached") {
      process.stderr.write(`[max-events] ${listenerEvent.event_count}/${listenerEvent.max_events}\n`);
    }
    recordSafely({ event: `listener.${listenerEvent.type}`, listener_event: trimRawEvent(listenerEvent) });
  },
  onCallback(callback) {
    if (callback.ok) {
      process.stderr.write(`[callback] card=${callback.card} action=${callback.action} run_id=${callback.run_id} user_id=${callback.user_id}\n`);
    } else {
      process.stderr.write(`[callback] rejected: ${callback.reason} (action=${callback.action})\n`);
    }
    recordSafely({ event: "card.callback_parsed", callback });
  },
  onError(error) {
    process.stderr.write(`[error] ${error.message}\n`);
    recordSafely({ event: "listener.error", error: { message: error.message } });
  },
  async onTrigger(callback) {
    process.stderr.write(`[trigger] approved! action=${callback.action} — launching run...\n`);
    recordSafely({ event: "card.callback_trigger_requested", callback });

    const result = await triggerRunFromCallback(callback, {
      inputPath: config.inputPath,
      outputPath: config.callbackRunPath,
      profile: config.profile,
      feishuTargets: config.feishu,
      dryRun: config.dryRun
    });

    process.stderr.write(`[trigger] run ${result.triggerRunId} → ${result.status}\n`);
    recordSafely({ event: "card.callback_trigger_result", result });
    console.log(JSON.stringify(result, null, 2));
  }
});

listener.start();

function shutdown() {
  process.stderr.write("\n[PilotFlow] Shutting down...\n");
  listener.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function loadListenerConfig() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help || args.h) {
    return { help: true };
  }

  const dryRun = args["dry-run"] === true;

  return {
    dryRun,
    profile: args.profile || process.env.PILOTFLOW_LARK_PROFILE || "pilotflow-contest",
    inputPath: resolve(args.input || process.env.PILOTFLOW_INPUT_PATH || "src/demo/fixtures/demo_input_project_init.txt"),
    outputPath: resolve(args.output || "tmp/runs/card-listener.jsonl"),
    callbackRunPath: resolve(args["callback-output"] || "tmp/runs/card-callback-runs.jsonl"),
    maxEvents: parsePositiveInteger(args["max-events"] || process.env.PILOTFLOW_LISTENER_MAX_EVENTS),
    timeoutMs: parseDurationMs(args.timeout || args["timeout-ms"] || process.env.PILOTFLOW_LISTENER_TIMEOUT),
    feishu: {
      chatId: args["chat-id"] || process.env.PILOTFLOW_TEST_CHAT_ID,
      baseToken: args["base-token"] || process.env.PILOTFLOW_BASE_TOKEN,
      baseTableId: args["base-table-id"] || process.env.PILOTFLOW_BASE_TABLE_ID
    }
  };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      process.stderr.write(`Unexpected argument: ${item}\n`);
      process.exit(1);
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

function parsePositiveInteger(value) {
  if (!value || value === true) return 0;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function parseDurationMs(value) {
  if (!value || value === true) return 0;
  if (typeof value === "number") return parsePositiveInteger(value);

  const text = String(value).trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(text);
  if (!match) {
    process.stderr.write(`Invalid duration: ${value}\n`);
    process.exit(1);
  }

  const amount = Number(match[1]);
  const unit = match[2] || "ms";
  const multipliers = { ms: 1, s: 1000, m: 60_000 };
  return Math.floor(amount * multipliers[unit]);
}

function trimRawEvent(listenerEvent) {
  if (!listenerEvent.raw || typeof listenerEvent.raw !== "object") return listenerEvent;
  return {
    ...listenerEvent,
    raw: {
      event_type: listenerEvent.raw.event_type,
      type: listenerEvent.raw.type,
      event: listenerEvent.raw.event
    }
  };
}

function printUsage() {
  console.log(`Usage:
  npm run listen:cards
  npm run listen:cards -- --dry-run
  npm run listen:cards -- --dry-run --max-events 1 --timeout 30s
  npm run listen:cards -- --profile pilotflow-contest --chat-id oc_xxx --base-token xxx --base-table-id tbl_xxx

Options:
  --dry-run                  Parse card callbacks but do not trigger live runs.
  --profile <name>           lark-cli profile. Defaults to pilotflow-contest.
  --input <path>             Input fixture path for triggered runs.
  --output <path>            JSONL event log path.
  --callback-output <path>   JSONL log for callback-triggered runs.
  --max-events <n>           Stop after n received events. Defaults to unlimited.
  --timeout <duration>       Stop after duration, e.g. 30000ms, 30s, 2m.
  --chat-id <oc_xxx>         Target Feishu group chat.
  --base-token <token>       Target Base token.
  --base-table-id <tbl_xxx>  Target Base table.
`);
}
