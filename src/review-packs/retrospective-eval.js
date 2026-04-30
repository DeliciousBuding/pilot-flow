import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildRunRetrospectivePack, selectDefaultInputPath } from "./run-retrospective-pack.js";

const CASES = [
  {
    id: "optional-tool-fallback",
    description: "Optional tool failures are recorded with a fallback path.",
    applicable: (pack) => hasSeed(pack, "optional-tool-fallback") || hasSignal(pack, "optional_fallback_used"),
    match: (pack) => hasSeed(pack, "optional-tool-fallback") && hasSignal(pack, "optional_fallback_used")
  },
  {
    id: "missing-owner-clarification",
    description: "Plans without accountable members are surfaced as a quality signal.",
    applicable: (pack) => hasSeed(pack, "missing-owner-clarification") || hasSignal(pack, "missing_members"),
    match: (pack) => hasSeed(pack, "missing-owner-clarification") && hasSignal(pack, "missing_members")
  },
  {
    id: "deadline-tbd-clarification",
    description: "TBD deadlines are surfaced before becoming precise task due dates.",
    applicable: (pack) => hasSeed(pack, "deadline-tbd-clarification") || hasSignal(pack, "deadline_tbd"),
    match: (pack) => hasSeed(pack, "deadline-tbd-clarification") && hasSignal(pack, "deadline_tbd")
  },
  {
    id: "planner-validation-fallback",
    description: "Planner validation failures are preserved as reviewable evidence.",
    applicable: (pack) => hasSeed(pack, "planner-validation-fallback") || hasSignal(pack, "plan_validation_failed"),
    match: (pack) => hasSeed(pack, "planner-validation-fallback") && hasSignal(pack, "plan_validation_failed")
  },
  {
    id: "tool-failure-trace",
    description: "Tool failures leave readable error evidence for review.",
    applicable: (pack) => hasSeed(pack, "tool-failure-trace") || hasSignal(pack, "tool_failure_recorded"),
    match: (pack) => hasSeed(pack, "tool-failure-trace") && hasSignal(pack, "tool_failure_recorded")
  }
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const events = await readJsonl(config.input);
  const pack = buildRetrospectiveEvalPack(events, { inputPath: config.input, output: config.output });
  const markdown = renderRetrospectiveEvalMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        eval_status: pack.status,
        run_id: pack.runId,
        passed: pack.summary.passed,
        total: pack.summary.total
      },
      null,
      2
    )
  );
}

export function buildRetrospectiveEvalPack(events, { inputPath = "", output = "" } = {}) {
  const retrospective = buildRunRetrospectivePack(events, { inputPath, output });
  const cases = CASES.map((item) => {
    const passed = item.match(retrospective);
    const applicable = item.applicable(retrospective);
    return {
      id: item.id,
      description: item.description,
      status: passed ? "passed" : applicable ? "failed" : "not_applicable",
      evidence: evidenceFor(retrospective, item.id, applicable)
    };
  });
  const passed = cases.filter((item) => item.status === "passed").length;
  const failed = cases.filter((item) => item.status === "failed").length;
  const notApplicable = cases.filter((item) => item.status === "not_applicable").length;

  return {
    generatedAt: new Date().toISOString(),
    inputPath,
    output,
    runId: retrospective.runId,
    status: failed === 0 ? "passed" : "failed",
    summary: {
      passed,
      failed,
      not_applicable: notApplicable,
      total: cases.length
    },
    cases
  };
}

export function renderRetrospectiveEvalMarkdown(pack) {
  const lines = [
    "# PilotFlow Retrospective Eval",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Run ID: \`${pack.runId}\``,
    `- Status: \`${pack.status}\``,
    pack.inputPath ? `- Source log: \`${pack.inputPath}\`` : null,
    "",
    "## Summary",
    "",
    "| Passed | Failed | Not Applicable | Total |",
    "| ---: | ---: | ---: | ---: |",
    `| ${pack.summary.passed} | ${pack.summary.failed} | ${pack.summary.not_applicable} | ${pack.summary.total} |`,
    "",
    "## Cases",
    "",
    "| Case | Status | Evidence |",
    "| --- | --- | --- |",
    ...pack.cases.map((item) => `| \`${item.id}\` | ${item.status} | ${escapeCell(item.evidence)} |`)
  ];

  return lines.filter((line) => line !== null).join("\n") + "\n";
}

function hasSeed(pack, id) {
  return pack.evaluationSeeds.some((item) => item.id === id);
}

function hasSignal(pack, key) {
  return pack.qualitySignals.some((item) => item.key === key);
}

function evidenceFor(pack, id, applicable) {
  const seed = pack.evaluationSeeds.find((item) => item.id === id);
  if (seed) return seed.source;
  if (!applicable) return "No matching retrospective signal in this run.";
  return "No matching retrospective seed was produced.";
}

function escapeCell(value = "") {
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
    output: resolve(typeof args.output === "string" ? args.output : "tmp/retrospective-eval/RETROSPECTIVE_EVAL.md")
  };
}

function buildUsage() {
  return `Usage:
  npm run review:retrospective-eval
  npm run review:retrospective-eval -- --input tmp/runs/latest-live-run.jsonl --output tmp/retrospective-eval/RETROSPECTIVE_EVAL.md

Options:
  --input <path>   JSONL run log path. Defaults to latest live run when present, otherwise latest manual run.
  --output <path>  Markdown eval report path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
