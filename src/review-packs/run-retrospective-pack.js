import { existsSync } from "node:fs";
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
  const pack = buildRunRetrospectivePack(events, {
    inputPath: config.input,
    output: config.output
  });
  const markdown = renderRunRetrospectiveMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        run_id: pack.runId,
        run_status: pack.status,
        quality_signal_count: pack.qualitySignals.length,
        improvement_count: pack.improvementProposals.length,
        evaluation_seed_count: pack.evaluationSeeds.length
      },
      null,
      2
    )
  );
}

export function buildRunRetrospectivePack(events, { inputPath = "", output = "" } = {}) {
  const recorder = buildFlightRecorderModel(events);
  const plan = recorder.plan || {};
  const toolFailures = events.filter((event) => event.event === "tool.failed");
  const validationFailures = events.filter((event) => event.event === "plan.validation_failed");
  const fallbacks = events.filter((event) => event.event === "optional_tool.fallback");

  return {
    generatedAt: new Date().toISOString(),
    inputPath,
    output,
    runId: recorder.runId,
    status: recorder.status,
    mode: recorder.mode,
    goal: plan.goal || "",
    deadline: plan.deadline || "",
    members: plan.members || [],
    summary: buildSummary({ events, recorder, toolFailures, validationFailures, fallbacks }),
    qualitySignals: buildQualitySignals({ plan, toolFailures, validationFailures, fallbacks }),
    improvementProposals: buildImprovementProposals({ toolFailures, validationFailures, fallbacks }),
    evaluationSeeds: buildEvaluationSeeds({ plan, toolFailures, validationFailures, fallbacks }),
    artifacts: recorder.artifacts,
    tools: recorder.tools,
    humanReview: buildHumanReview({ toolFailures, validationFailures, fallbacks })
  };
}

export function renderRunRetrospectiveMarkdown(pack) {
  const lines = [
    "# PilotFlow Run Retrospective Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Run ID: \`${pack.runId}\``,
    `- Status: \`${pack.status}\``,
    `- Mode: \`${pack.mode}\``,
    pack.inputPath ? `- Source log: \`${pack.inputPath}\`` : null,
    pack.output ? `- Output: \`${pack.output}\`` : null,
    "",
    "## Scenario",
    "",
    `Goal: ${pack.goal || "Unknown"}`,
    "",
    `Deadline: ${pack.deadline || "TBD"}`,
    "",
    `Members: ${formatListInline(pack.members)}`,
    "",
    "## Run Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Events | ${pack.summary.events} |`,
    `| Tools called | ${pack.summary.toolCalled} |`,
    `| Tools succeeded | ${pack.summary.toolSucceeded} |`,
    `| Tools failed | ${pack.summary.toolFailed} |`,
    `| Optional fallbacks | ${pack.summary.optionalFallbacks} |`,
    `| Artifacts | ${pack.summary.artifacts} |`,
    "",
    "## Quality Signals",
    "",
    "| Signal | Severity | Evidence |",
    "| --- | --- | --- |",
    ...pack.qualitySignals.map((item) => `| \`${item.key}\` | ${item.severity} | ${escapeMarkdownCell(item.evidence)} |`),
    "",
    "## Improvement Proposals",
    "",
    "| Area | Proposal | Evidence |",
    "| --- | --- | --- |",
    ...pack.improvementProposals.map((item) => `| ${escapeMarkdownCell(item.area)} | ${escapeMarkdownCell(item.proposal)} | ${escapeMarkdownCell(item.evidence)} |`),
    "",
    "## Evaluation Seeds",
    "",
    "| ID | Behavior to lock | Source |",
    "| --- | --- | --- |",
    ...pack.evaluationSeeds.map((item) => `| \`${item.id}\` | ${escapeMarkdownCell(item.behavior)} | ${escapeMarkdownCell(item.source)} |`),
    "",
    "## Human Review",
    "",
    ...pack.humanReview.map((item) => `- [ ] ${item}`),
    "",
    "## Boundaries",
    "",
    "- This pack is a review artifact generated from a recorded run; it does not mutate Feishu state.",
    "- Improvement proposals require human approval before changing workflows, templates, prompts, or tests.",
    "- Worker-style follow-up should produce preview artifacts or proposed writes, not direct live side effects."
  ];

  return lines.filter((line) => line !== null).join("\n") + "\n";
}

function buildSummary({ events, recorder, toolFailures, validationFailures, fallbacks }) {
  return {
    events: events.length,
    toolCalled: events.filter((event) => event.event === "tool.called").length,
    toolSucceeded: events.filter((event) => event.event === "tool.succeeded").length,
    toolFailed: toolFailures.length,
    validationFailures: validationFailures.length,
    optionalFallbacks: fallbacks.length,
    artifacts: recorder.artifacts.length
  };
}

function buildQualitySignals({ plan, toolFailures, validationFailures, fallbacks }) {
  return [
    !Array.isArray(plan.members) || plan.members.length === 0
      ? signal("missing_members", "high", "The generated plan has no accountable members.")
      : null,
    isDeadlineTbd(plan.deadline)
      ? signal("deadline_tbd", "medium", `The generated deadline is ${plan.deadline || "empty"}.`)
      : null,
    validationFailures.length > 0
      ? signal("plan_validation_failed", "high", summarizeValidation(validationFailures))
      : null,
    toolFailures.length > 0
      ? signal("tool_failure_recorded", "medium", summarizeTools(toolFailures))
      : null,
    fallbacks.length > 0
      ? signal("optional_fallback_used", "medium", summarizeFallbacks(fallbacks))
      : null
  ].filter(Boolean);
}

function buildImprovementProposals({ toolFailures, validationFailures, fallbacks }) {
  const proposals = [];

  if (fallbacks.some((event) => event.tool === "announcement.update")) {
    proposals.push({
      area: "Feishu platform fallback",
      proposal: "Keep announcement writes optional and present pinned entry message as the primary reliable group entry until docx announcements are verified.",
      evidence: summarizeFallbacks(fallbacks)
    });
  } else if (fallbacks.length > 0) {
    proposals.push({
      area: "Optional tool fallback",
      proposal: "Promote the observed fallback into a named evaluation case and keep the main workflow completed when the fallback succeeds.",
      evidence: summarizeFallbacks(fallbacks)
    });
  }

  if (validationFailures.length > 0) {
    proposals.push({
      area: "Planner quality gate",
      proposal: "Turn the validation failure into a regression fixture so unclear owner, deadline, or deliverable extraction is caught before live writes.",
      evidence: summarizeValidation(validationFailures)
    });
  }

  if (toolFailures.length > 0 && fallbacks.length === 0) {
    proposals.push({
      area: "Tool reliability",
      proposal: "Classify the failing tool as required or optional and add an explicit retry, skip, or stop rule.",
      evidence: summarizeTools(toolFailures)
    });
  }

  if (proposals.length === 0) {
    proposals.push({
      area: "No immediate change",
      proposal: "Keep the current workflow and compare this run against future run retrospectives.",
      evidence: "No validation failure, tool failure, or optional fallback was recorded."
    });
  }

  return proposals;
}

function buildEvaluationSeeds({ plan, toolFailures, validationFailures, fallbacks }) {
  return [
    fallbacks.length > 0
      ? {
          id: "optional-tool-fallback",
          behavior: "Optional tool failure records a fallback and keeps the reviewable run trace complete.",
          source: summarizeFallbacks(fallbacks)
        }
      : null,
    validationFailures.length > 0
      ? {
          id: "planner-validation-fallback",
          behavior: "Invalid or incomplete plans are surfaced before live side effects.",
          source: summarizeValidation(validationFailures)
        }
      : null,
    !Array.isArray(plan.members) || plan.members.length === 0
      ? {
          id: "missing-owner-clarification",
          behavior: "Plans without accountable members should trigger clarification or safe textual fallback.",
          source: "plan.members is empty"
        }
      : null,
    isDeadlineTbd(plan.deadline)
      ? {
          id: "deadline-tbd-clarification",
          behavior: "Plans with TBD deadlines should not silently become precise task due dates.",
          source: `plan.deadline is ${plan.deadline || "empty"}`
        }
      : null,
    toolFailures.length > 0
      ? {
          id: "tool-failure-trace",
          behavior: "Failed tools should leave readable error evidence in the Flight Recorder and retrospective pack.",
          source: summarizeTools(toolFailures)
        }
      : null
  ].filter(Boolean);
}

function buildHumanReview({ toolFailures, validationFailures, fallbacks }) {
  const items = [
    "Decide whether each improvement proposal should update workflow code, planner fixtures, templates, docs, or tests.",
    "Confirm that no generated recommendation should be applied directly to Feishu without a separate approval step."
  ];

  if (validationFailures.length > 0) {
    items.push("Review planner validation failures and choose whether to ask for clarification or accept textual fallback fields.");
  }
  if (toolFailures.length > 0) {
    items.push("Review tool failures and classify each failing tool as required, optional, retryable, or blocked by platform configuration.");
  }
  if (fallbacks.length > 0) {
    items.push("Review optional fallback evidence and decide whether it should become a permanent product path or a temporary contest workaround.");
  }

  return items;
}

function signal(key, severity, evidence) {
  return { key, severity, evidence };
}

function isDeadlineTbd(value = "") {
  return !value || /^(tbd|待定|unknown|未定)$/i.test(String(value).trim());
}

function summarizeValidation(events) {
  return events
    .flatMap((event) => event.validation_errors || event.errors || [])
    .map((error) => `${error.path || "plan"}: ${error.message || "invalid"}`)
    .join("; ");
}

function summarizeTools(events) {
  return events.map((event) => `${event.tool || "unknown"}: ${summarizeError(event.error) || "failed"}`).join("; ");
}

function summarizeFallbacks(events) {
  return events
    .map((event) => `${event.tool || "optional tool"} -> ${event.fallback || "fallback"}${event.error ? ` (${summarizeError(event.error)})` : ""}`)
    .join("; ");
}

function summarizeError(value = "") {
  const text = typeof value === "string" ? value : value?.message || JSON.stringify(value);
  return String(text).split(/\r?\n/).find(Boolean) || "";
}

function formatListInline(items = []) {
  return items.length > 0 ? items.join(", ") : "TBD";
}

function escapeMarkdownCell(value = "") {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
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
    input: resolve(typeof args.input === "string" ? args.input : selectDefaultInputPath()),
    output: resolve(typeof args.output === "string" ? args.output : "tmp/run-retrospective/RUN_RETROSPECTIVE.md")
  };
}

export function selectDefaultInputPath(baseDir = process.cwd()) {
  const livePath = resolve(baseDir, "tmp/runs/latest-live-run.jsonl");
  if (existsSync(livePath)) return livePath;
  return resolve(baseDir, "tmp/runs/latest-manual-run.jsonl");
}

function buildUsage() {
  return `Usage:
  npm run review:retrospective
  npm run review:retrospective -- --input tmp/runs/latest-live-run.jsonl --output tmp/run-retrospective/RUN_RETROSPECTIVE.md

Options:
  --input <path>   JSONL run log path. Defaults to latest live run when present, otherwise latest manual run.
  --output <path>  Markdown retrospective report path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
