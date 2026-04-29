import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoFailurePack(config);
  const markdown = renderDemoFailureMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        scenario_count: pack.scenarios.length,
        evidence_ready_count: pack.scenarios.filter((item) => item.evidenceStatus === "ready").length
      },
      null,
      2
    )
  );
}

export async function buildDemoFailurePack({
  listenerLog = "tmp/runs/card-button-listener-dryrun-20260429.jsonl",
  liveRunLog = "tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl",
  evalPack = "tmp/demo-eval/DEMO_EVAL_20260429.md",
  output = "tmp/demo-failure/FAILURE_DEMO.md"
} = {}) {
  const listenerEvents = await readJsonlOptional(listenerLog);
  const liveEvents = await readJsonlOptional(liveRunLog);
  const evalText = await readOptionalText(evalPack);

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    sources: [
      sourceEvidence("Card callback listener log", listenerLog, listenerEvents.length > 0),
      sourceEvidence("Live announcement fallback run log", liveRunLog, liveEvents.length > 0),
      sourceEvidence("Demo Evaluation Pack", evalPack, Boolean(evalText))
    ],
    scenarios: [
      buildCallbackScenario(listenerEvents),
      buildAnnouncementScenario(liveEvents),
      buildInvalidPlanScenario(evalText),
      buildDuplicateRunScenario(evalText),
      buildRequirementRiskScenario(evalText)
    ]
  };
}

export function renderDemoFailureMarkdown(pack) {
  const lines = [
    "# PilotFlow Failure-Path Demo Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Scenarios: ${pack.scenarios.length}`,
    "",
    "## Source Evidence",
    "",
    "| Source | Status | Path |",
    "| --- | --- | --- |",
    ...pack.sources.map((item) => `| ${item.label} | ${item.ready ? "Ready" : "Missing"} | \`${item.path}\` |`),
    "",
    "## Failure Path Matrix",
    "",
    "| Scenario | Evidence | Product behavior | Demo line |",
    "| --- | --- | --- | --- |",
    ...pack.scenarios.map((item) => `| ${item.title} | ${item.evidenceStatus} | ${escapeCell(item.behavior)} | ${escapeCell(item.demoLine)} |`),
    "",
    "## Scenario Details",
    "",
    ...pack.scenarios.flatMap((item) => [
      `### ${item.title}`,
      "",
      `Evidence status: \`${item.evidenceStatus}\``,
      "",
      `Behavior: ${item.behavior}`,
      "",
      `Demo line: ${item.demoLine}`,
      "",
      "Evidence:",
      "",
      ...item.evidence.map((line) => `- ${line}`),
      ""
    ]),
    "## Boundaries",
    "",
    "- This is a failure-path demo pack, not a replacement for real recording.",
    "- It does not claim live card callback delivery is verified.",
    "- It does not claim group announcement works in the current test group.",
    "- It should be shown together with the happy-path Capture Pack and real Feishu artifacts."
  ];

  return `${lines.join("\n")}\n`;
}

function buildCallbackScenario(events) {
  const connected = events.some((event) => /Connected\./.test(event.listener_event?.message || ""));
  const timeout = events.find((event) => event.event === "listener.listener_timeout");
  const eventCount = timeout?.listener_event?.event_count;
  const ready = connected && eventCount === 0;

  return scenario({
    title: "Card callback event did not arrive",
    ready,
    behavior: "Keep text confirmation as the stable fallback while Open Platform callback configuration is verified.",
    demoLine: "The listener connected to Feishu, but no `card.action.trigger` event arrived in the bounded window, so PilotFlow does not over-claim button automation.",
    evidence: [
      `Listener connected: ${connected ? "yes" : "no"}`,
      `Timeout event count: ${eventCount ?? "missing"}`,
      `Listener run ID: ${events.find((event) => event.run_id)?.run_id || "missing"}`
    ]
  });
}

function buildAnnouncementScenario(events) {
  const failed = events.find((event) => event.event === "tool.failed" && event.tool === "announcement.update");
  const fallback = events.find((event) => event.event === "optional_tool.fallback" && event.tool === "announcement.update");
  const completed = events.some((event) => event.event === "run.completed");
  const message = summarizeError(failed?.error?.message || fallback?.error?.message || "");
  const ready = /232097/.test(message) && fallback?.fallback === "continue_with_existing_project_entry_path" && completed;

  return scenario({
    title: "Group announcement API blocked",
    ready,
    behavior: "Record the failed optional announcement artifact and continue with the pinned project-entry message.",
    demoLine: "The current test group returns `232097`, so PilotFlow records the failure and keeps the project discoverable through the pinned entry.",
    evidence: [
      `Error: ${message || "missing"}`,
      `Fallback: ${fallback?.fallback || "missing"}`,
      `Run completed after fallback: ${completed ? "yes" : "no"}`
    ]
  });
}

function buildInvalidPlanScenario(evalText) {
  const ready = /Invalid planner schema[\s\S]*?Status:\s*`pass`/i.test(evalText);
  return scenario({
    title: "Invalid planner schema",
    ready,
    behavior: "Return a clarification plan before confirmation, duplicate guard, or Feishu side effects.",
    demoLine: "PilotFlow fails closed when the planner output is structurally invalid.",
    evidence: extractEvalBlock(evalText, "Invalid planner schema", ["Validation ok", "Validation paths", "Fallback status prompt"])
  });
}

function buildDuplicateRunScenario(evalText) {
  const ready = /Duplicate live run[\s\S]*?DUPLICATE_RUN_BLOCKED/i.test(evalText);
  return scenario({
    title: "Duplicate live run blocked",
    ready,
    behavior: "Block repeated visible Feishu writes unless the operator explicitly bypasses the guard.",
    demoLine: "Repeated demo writes are guarded so reviewers do not see duplicated Docs, Tasks, or group messages.",
    evidence: [
      ready ? "Guard result: DUPLICATE_RUN_BLOCKED" : "Guard result: missing",
      ...extractEvalBlock(evalText, "Duplicate live run", ["Dedupe key format", "Existing run", "Existing artifact count"])
    ]
  });
}

function buildRequirementRiskScenario(evalText) {
  const missingReady = /Missing owner and deliverables[\s\S]*?Status:\s*`pass`/i.test(evalText);
  const deadlineReady = /Vague deadline and text owner fallback[\s\S]*?Status:\s*`pass`/i.test(evalText);
  return scenario({
    title: "Missing owner or vague deadline",
    ready: missingReady && deadlineReady,
    behavior: "Keep the run explainable by surfacing ownership, deliverable, and deadline risks before polishing the demo.",
    demoLine: "PilotFlow does not bury unclear project facts; it turns them into explicit risks and recommended actions.",
    evidence: [
      ...extractEvalBlock(evalText, "Missing owner and deliverables", ["Highest risk level", "Recommended action", "Detected risk IDs"]),
      ...extractEvalBlock(evalText, "Vague deadline and text owner fallback", ["Deadline input", "Detected risk IDs", "Owner fallback risk owner"])
    ]
  });
}

function scenario({ title, ready, behavior, demoLine, evidence }) {
  return {
    title,
    evidenceStatus: ready ? "ready" : "missing",
    behavior,
    demoLine,
    evidence: evidence.length > 0 ? evidence : ["No evidence extracted."]
  };
}

function sourceEvidence(label, filePath, ready) {
  return { label, path: resolve(filePath), ready };
}

function extractEvalBlock(text, heading, markers) {
  const start = text.indexOf(`### ${heading}`);
  if (start === -1) return [`${heading}: missing`];
  const next = text.indexOf("\n### ", start + 1);
  const block = text.slice(start, next === -1 ? text.length : next);
  return markers.map((marker) => {
    const line = block
      .split(/\r?\n/)
      .map((item) => item.replace(/^- /, "").trim())
      .find((item) => item.includes(marker));
    return line || `${marker}: missing`;
  });
}

function summarizeError(value = "") {
  const parsed = tryParseJson(value);
  if (parsed?.error?.message) return parsed.error.message;
  if (parsed?.message) return parsed.message;
  const line = String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => /API error|\d{6}/.test(item));
  return line || String(value).split(/\r?\n/).find(Boolean) || "";
}

function tryParseJson(value = "") {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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
    return await readFile(filePath, "utf8");
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
    listenerLog: resolve(typeof args["listener-log"] === "string" ? args["listener-log"] : "tmp/runs/card-button-listener-dryrun-20260429.jsonl"),
    liveRunLog: resolve(typeof args["live-run-log"] === "string" ? args["live-run-log"] : "tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl"),
    evalPack: resolve(typeof args["eval-pack"] === "string" ? args["eval-pack"] : "tmp/demo-eval/DEMO_EVAL_20260429.md"),
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-failure/FAILURE_DEMO.md")
  };
}

function buildUsage() {
  return `Usage:
  npm run demo:failure
  npm run demo:failure -- --output tmp/demo-failure/FAILURE_DEMO.md

Options:
  --listener-log <path>  Bounded card listener JSONL log.
  --live-run-log <path>  Live run JSONL log with announcement fallback.
  --eval-pack <path>     Demo Evaluation Pack markdown path.
  --output <path>        Failure-path demo markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
