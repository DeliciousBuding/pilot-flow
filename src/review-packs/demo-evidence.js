import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFlightRecorderModel } from "../interfaces/cli/flight-recorder-view.js";

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const events = await readJsonl(config.input);
  const model = buildDemoEvidenceModel(events, { inputPath: config.input });
  const markdown = renderDemoEvidenceMarkdown(model);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        run_id: model.runId,
        run_status: model.status,
        artifact_count: model.artifacts.length,
        failed_optional_count: model.failedOptionalArtifacts.length,
        evidence_items: model.evidenceChecklist.filter((item) => item.ok).length
      },
      null,
      2
    )
  );
}

export function buildDemoEvidenceModel(events, { inputPath = "" } = {}) {
  const recorder = buildFlightRecorderModel(events);
  const toolFailures = events.filter((event) => event.event === "tool.failed");
  const fallbacks = events.filter((event) => event.event === "optional_tool.fallback");
  const artifacts = recorder.artifacts;
  const failedOptionalArtifacts = artifacts.filter((artifact) => artifact.status === "failed");
  const artifactTypes = new Set(artifacts.map((artifact) => artifact.type));

  return {
    runId: recorder.runId,
    status: recorder.status,
    mode: recorder.mode,
    inputPath,
    goal: recorder.plan?.goal || "",
    deadline: recorder.plan?.deadline || "",
    members: recorder.plan?.members || [],
    deliverables: recorder.plan?.deliverables || [],
    artifacts,
    tools: recorder.tools,
    toolFailures,
    fallbacks,
    failedOptionalArtifacts,
    evidenceChecklist: [
      evidenceItem("Plan generated", Boolean(recorder.plan), "PilotFlow produced a structured project execution plan."),
      evidenceItem("Doc created", artifactTypes.has("doc"), "A Feishu Doc artifact is present."),
      evidenceItem("Base state written", artifactTypes.has("base_record"), "Project state rows were written or planned."),
      evidenceItem("Task created", artifactTypes.has("task"), "A Feishu Task artifact is present."),
      evidenceItem("Risk card sent", artifacts.some((artifact) => artifact.type === "card" && /风险|risk/i.test(artifact.title)), "A risk decision card was sent or planned."),
      evidenceItem("Project entry pinned", artifactTypes.has("pinned_message"), "A stable project entry was pinned in the group."),
      evidenceItem("Announcement fallback recorded", artifacts.some((artifact) => artifact.type === "announcement"), "Group announcement path was attempted or planned."),
      evidenceItem("Final summary sent", artifactTypes.has("message"), "A final IM summary was sent or planned."),
      evidenceItem("Run completed", recorder.status === "completed", "The run reached a terminal completed state.")
    ]
  };
}

export function renderDemoEvidenceMarkdown(model) {
  const lines = [
    "# PilotFlow Demo Evidence Pack",
    "",
    `- Run ID: \`${model.runId}\``,
    `- Status: \`${model.status}\``,
    `- Mode: \`${model.mode}\``,
    model.inputPath ? `- Source log: \`${model.inputPath}\`` : null,
    "",
    "## Scenario",
    "",
    `Goal: ${model.goal || "Unknown"}`,
    "",
    `Deadline: ${model.deadline || "TBD"}`,
    "",
    `Members: ${formatListInline(model.members)}`,
    "",
    `Deliverables: ${formatListInline(model.deliverables)}`,
    "",
    "## Evidence Checklist",
    "",
    "| Evidence | Status | Notes |",
    "| --- | --- | --- |",
    ...model.evidenceChecklist.map((item) => `| ${item.label} | ${item.ok ? "OK" : "Missing"} | ${item.notes} |`),
    "",
    "## Artifacts",
    "",
    "| Type | Status | Title | External ID / URL |",
    "| --- | --- | --- | --- |",
    ...model.artifacts.map((artifact) => `| ${artifact.type} | ${artifact.status} | ${escapeMarkdownCell(artifact.title)} | ${escapeMarkdownCell(artifact.url || artifact.external_id || artifact.message_id || artifact.revision || "")} |`),
    "",
    "## Tool Calls",
    "",
    "| Tool Call | Tool | Status |",
    "| --- | --- | --- |",
    ...model.tools.map((tool) => `| ${tool.id} | ${tool.tool} | ${tool.status} |`),
    "",
    "## Fallbacks And Known Limits",
    ""
  ];

  if (model.failedOptionalArtifacts.length === 0 && model.fallbacks.length === 0) {
    lines.push("- No fallback was recorded in this run.");
  } else {
    for (const artifact of model.failedOptionalArtifacts) {
      lines.push(`- ${artifact.type}: ${summarizeError(artifact.error) || "failed optional artifact"}`);
    }
    for (const fallback of model.fallbacks) {
      lines.push(`- ${fallback.tool}: ${fallback.fallback}${fallback.error ? ` (${summarizeError(fallback.error)})` : ""}`);
    }
  }

  lines.push(
    "",
    "## Demo Notes",
    "",
    "- Use the Feishu group as the primary screen: card, risk card, pinned entry, and final summary are visible there.",
    "- Use Base to show owner, due date, risk level, source run, source message, and URL fields.",
    "- Use the Flight Recorder HTML view to explain traceability and fallback handling.",
    "- If card callback delivery is unavailable, present text confirmation as the stable fallback."
  );

  return lines.filter((line) => line !== null).join("\n") + "\n";
}

function evidenceItem(label, ok, notes) {
  return { label, ok, notes };
}

function formatListInline(items = []) {
  return items.length > 0 ? items.join(", ") : "TBD";
}

function escapeMarkdownCell(value = "") {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function summarizeError(value = "") {
  const text = typeof value === "string" ? value : value?.message || JSON.stringify(value);
  const parsed = tryParseJson(text);
  if (parsed?.error?.message) return parsed.error.message;
  if (parsed?.message) return parsed.message;
  const apiLine = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /API error|\d{6}/.test(line));
  return (apiLine || String(text).split(/\r?\n/).find(Boolean) || "").replace(/^"message":\s*"|",?$/g, "");
}

function tryParseJson(value = "") {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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
    input: resolve(typeof args.input === "string" ? args.input : "tmp/runs/latest-manual-run.jsonl"),
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-evidence/DEMO_EVIDENCE.md")
  };
}

function buildUsage() {
  return `Usage:
  npm run review:evidence
  npm run review:evidence -- --input tmp/runs/latest-manual-run.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE.md

Options:
  --input <path>   JSONL run log path.
  --output <path>  Markdown evidence report path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
