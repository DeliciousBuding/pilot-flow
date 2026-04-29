import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_ACTIONS = ["confirm_takeoff", "edit_plan", "doc_only", "cancel"];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildCallbackVerificationPack(config);
  const markdown = renderCallbackVerificationMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        verification_status: pack.status,
        card_ready: pack.card.ready,
        listener_status: pack.listener.status,
        next_action_count: pack.nextActions.length
      },
      null,
      2
    )
  );
}

export async function buildCallbackVerificationPack({
  cardRunLog = "tmp/runs/card-button-verify-send-20260429-fixed.jsonl",
  listenerLog = "tmp/runs/card-button-listener-dryrun-20260429.jsonl",
  permissionPack = "tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md",
  output = "tmp/demo-callback/CALLBACK_VERIFICATION.md"
} = {}) {
  const cardEvents = await readJsonlOptional(cardRunLog);
  const listenerEvents = await readJsonlOptional(listenerLog);
  const permissionText = await readOptionalText(permissionPack);
  const card = inspectCardRun(cardEvents);
  const listener = inspectListener(listenerEvents);
  const permissions = inspectPermissions(permissionText);
  const status = deriveStatus({ card, listener, permissions });

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    status,
    sources: [
      sourceEvidence("Flight-plan card send run log", cardRunLog, cardEvents.length > 0),
      sourceEvidence("Bounded card listener log", listenerLog, listenerEvents.length > 0),
      sourceEvidence("Permission Appendix Pack", permissionPack, Boolean(permissionText))
    ],
    card,
    listener,
    permissions,
    checklist: buildChecklist({ card, listener, permissions }),
    nextActions: buildNextActions({ card, listener, permissions, status })
  };
}

export function renderCallbackVerificationMarkdown(pack) {
  const lines = [
    "# PilotFlow Callback Verification Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Verification status: \`${pack.status}\``,
    "",
    "## Source Evidence",
    "",
    "| Source | Status | Path |",
    "| --- | --- | --- |",
    ...pack.sources.map((item) => `| ${item.label} | ${item.ready ? "Ready" : "Missing"} | \`${item.path}\` |`),
    "",
    "## Current Signal",
    "",
    "| Signal | Status | Notes |",
    "| --- | --- | --- |",
    `| Flight-plan card sent | ${pack.card.ready ? "ready" : "missing"} | ${escapeCell(pack.card.summary)} |`,
    `| Button action values | ${pack.card.actionsReady ? "ready" : "missing"} | ${escapeCell(pack.card.actionSummary)} |`,
    `| Listener connection | ${pack.listener.status} | ${escapeCell(pack.listener.summary)} |`,
    `| Permission appendix | ${pack.permissions.status} | ${escapeCell(pack.permissions.summary)} |`,
    "",
    "## Verification Checklist",
    "",
    ...pack.checklist.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`),
    "",
    "## Next Actions",
    "",
    ...pack.nextActions.map((item) => `- [ ] ${item}`),
    "",
    "## Review Boundary",
    "",
    "- This pack can prove readiness of card payloads and listener wiring, but not real callback delivery by itself.",
    "- Keep text confirmation as the stable fallback until a real `card.action.trigger` event is captured.",
    "- Do not publish raw listener logs because SDK stderr can contain transient connection URLs or tickets."
  ];

  return `${lines.join("\n")}\n`;
}

function inspectCardRun(events) {
  const toolCall = events.find((event) => event.event === "tool.called" && event.tool === "card.send");
  const success = events.find((event) => event.event === "tool.succeeded" && event.tool === "card.send");
  const artifact = events.find((event) => event.event === "artifact.created" && event.artifact?.type === "card");
  const card = toolCall?.input?.card || {};
  const actions = extractButtonActions(card);
  const missingActions = EXPECTED_ACTIONS.filter((action) => !actions.includes(action));
  const messageId = artifact?.artifact?.external_id || success?.output?.json?.data?.message_id || "";
  const ready = Boolean(toolCall && success && messageId);

  return {
    ready,
    messageId,
    actions,
    missingActions,
    actionsReady: missingActions.length === 0,
    summary: ready ? `Card message sent and normalized as ${messageId}.` : "No successful card send evidence found.",
    actionSummary:
      missingActions.length === 0
        ? `Found expected actions: ${actions.join(", ")}.`
        : `Missing actions: ${missingActions.join(", ")}.`
  };
}

function extractButtonActions(card) {
  const elements = Array.isArray(card.elements) ? card.elements : [];
  return elements
    .filter((element) => element.tag === "action")
    .flatMap((element) => (Array.isArray(element.actions) ? element.actions : []))
    .map((action) => action.value?.pilotflow_action)
    .filter(Boolean);
}

function inspectListener(events) {
  const connected = events.some((event) => /Connected\./.test(event.listener_event?.message || ""));
  const timeout = events.find((event) => event.event === "listener.listener_timeout");
  const eventCount = Number(timeout?.listener_event?.event_count ?? events.filter((event) => event.event === "listener.event_received").length);
  const callbackReceived = events.some((event) => event.event === "listener.event_received" && /card\.action\.trigger/.test(JSON.stringify(event)));

  if (callbackReceived) {
    return {
      status: "callback_received",
      eventCount,
      summary: `Received ${eventCount} listener event(s), including a card callback marker.`
    };
  }

  if (connected && eventCount === 0) {
    return {
      status: "connected_no_callback",
      eventCount,
      summary: "Listener connected to Feishu, then timed out with zero callback events."
    };
  }

  return {
    status: connected ? "connected_needs_review" : "missing",
    eventCount,
    summary: connected ? "Listener log exists but should be inspected before claiming callback delivery." : "No listener connection evidence found."
  };
}

function inspectPermissions(text) {
  if (!text) {
    return {
      status: "missing",
      summary: "Permission Appendix Pack was not found."
    };
  }

  if (/Event subscribe dry-run \|\s*ready/i.test(text)) {
    return {
      status: "event_dry_run_ready",
      summary: "Permission appendix reports the bot dry-run command accepts `card.action.trigger`."
    };
  }

  return {
    status: "generated_needs_review",
    summary: "Permission appendix exists, but event dry-run readiness was not detected."
  };
}

function deriveStatus({ card, listener, permissions }) {
  if (card.ready && card.actionsReady && listener.status === "callback_received") return "callback_verified";
  if (card.ready && card.actionsReady && permissions.status === "event_dry_run_ready" && listener.status === "connected_no_callback") {
    return "blocked_on_platform_callback_event";
  }
  if (card.ready && card.actionsReady) return "payload_ready_listener_pending";
  return "not_ready";
}

function buildChecklist({ card, listener, permissions }) {
  return [
    { done: card.ready, text: "Flight-plan card was sent successfully to the test group." },
    { done: card.actionsReady, text: "Card buttons contain `pilotflow_card`, `pilotflow_run_id`, and all expected `pilotflow_action` values." },
    { done: permissions.status === "event_dry_run_ready", text: "Bot event-subscribe dry-run accepts `card.action.trigger`." },
    { done: listener.status === "connected_no_callback" || listener.status === "callback_received", text: "Bounded listener connected during a controlled validation window." },
    { done: listener.status === "callback_received", text: "A real `card.action.trigger` event was captured and parsed." }
  ];
}

function buildNextActions({ listener, status }) {
  if (status === "callback_verified") {
    return [
      "Promote the verified callback path into the main demo script.",
      "Regenerate Judge Review and Readiness packs with callback verified."
    ];
  }

  const actions = [
    "Open Feishu Open Platform event/callback settings and capture the `card.action.trigger` configuration state.",
    "Confirm the app bot is installed in the target group and the sent card belongs to the same app profile.",
    "Run `npm run listen:cards -- --max-events 1 --timeout 2m` immediately before clicking the flight-plan card button.",
    "After clicking the button, regenerate this pack with the new listener log.",
    "Keep text confirmation as fallback in the live demo until this pack reports `callback_verified`."
  ];

  if (listener.status === "missing") {
    actions.unshift("Run a bounded listener attempt and save its JSONL log.");
  }

  return actions;
}

function sourceEvidence(label, filePath, ready) {
  return { label, path: resolve(filePath), ready };
}

async function readJsonlOptional(filePath) {
  const text = await readOptionalText(filePath);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readOptionalText(filePath) {
  try {
    return await readFile(resolve(filePath), "utf8");
  } catch {
    return "";
  }
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
    cardRunLog: resolve(typeof args["card-run-log"] === "string" ? args["card-run-log"] : "tmp/runs/card-button-verify-send-20260429-fixed.jsonl"),
    listenerLog: resolve(typeof args["listener-log"] === "string" ? args["listener-log"] : "tmp/runs/card-button-listener-dryrun-20260429.jsonl"),
    permissionPack: resolve(typeof args["permission-pack"] === "string" ? args["permission-pack"] : "tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md"),
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-callback/CALLBACK_VERIFICATION.md")
  };
}

function buildUsage() {
  return `Usage:
  npm run demo:callback-verification
  npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION.md

Options:
  --card-run-log <path>      Flight-plan card send JSONL log.
  --listener-log <path>      Bounded card listener JSONL log.
  --permission-pack <path>   Permission Appendix Pack markdown path.
  --output <path>            Callback verification markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
