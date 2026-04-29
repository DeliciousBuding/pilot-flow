import { rm } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateProjectInitPlan, buildPlanValidationFallbackPlan } from "../core/planner/plan-validator.js";
import { detectProjectRisks, summarizeRiskDecision } from "../core/orchestrator/risk-detector.js";
import { DuplicateRunGuard, buildProjectInitDedupeKey, duplicateGuardSummary } from "../core/orchestrator/duplicate-run-guard.js";
import { buildDemoEvidenceModel } from "./demo-evidence.js";

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const report = await buildDemoEvalReport({ guardPath: config.guardPath });
  const markdown = renderDemoEvalMarkdown(report);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        pass_count: report.summary.pass,
        fail_count: report.summary.fail,
        case_count: report.cases.length
      },
      null,
      2
    )
  );
}

export async function buildDemoEvalReport({ guardPath = "tmp/tests/demo-eval-guard.json" } = {}) {
  const cases = [];

  cases.push(evaluateMissingOwner());
  cases.push(evaluateVagueDeadline());
  cases.push(evaluateInvalidPlan());
  cases.push(await evaluateDuplicateGuard(guardPath));
  cases.push(evaluateOptionalToolFailure());

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      pass: cases.filter((item) => item.status === "pass").length,
      fail: cases.filter((item) => item.status === "fail").length
    },
    cases
  };
}

export function renderDemoEvalMarkdown(report) {
  const lines = [
    "# PilotFlow Demo Evaluation Pack",
    "",
    `- Generated at: \`${report.generatedAt}\``,
    `- Cases: ${report.cases.length}`,
    `- Pass: ${report.summary.pass}`,
    `- Fail: ${report.summary.fail}`,
    "",
    "## Evaluation Matrix",
    "",
    "| Case | Status | Product behavior | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.cases.map((item) => `| ${item.name} | ${item.status.toUpperCase()} | ${escapeCell(item.behavior)} | ${escapeCell(item.evidence)} |`),
    "",
    "## Case Details",
    "",
    ...report.cases.flatMap((item) => [
      `### ${item.name}`,
      "",
      `Status: \`${item.status}\``,
      "",
      `Behavior: ${item.behavior}`,
      "",
      "Evidence:",
      "",
      ...item.details.map((detail) => `- ${detail}`),
      ""
    ])
  ];

  return lines.join("\n");
}

function evaluateMissingOwner() {
  const plan = validPlan({
    members: [],
    deliverables: [],
    deadline: "TBD",
    risks: []
  });
  const risks = detectProjectRisks(plan);
  const summary = summarizeRiskDecision(risks);
  const hasMissingMembers = risks.some((risk) => risk.id === "derived-missing-members" && risk.level === "high");
  const hasMissingDeliverables = risks.some((risk) => risk.id === "derived-missing-deliverables" && risk.level === "high");
  const ok = hasMissingMembers && hasMissingDeliverables && summary.recommended_action === "confirm_owner_or_deadline";

  return evalCase({
    name: "Missing owner and deliverables",
    ok,
    behavior: "Detect high-risk missing ownership and ask for owner or scope confirmation before a polished demo.",
    evidence: `risks=${risks.map((risk) => risk.id).join(", ")}`,
    details: [
      `Highest risk level: ${summary.highest_level}`,
      `Recommended action: ${summary.recommended_action}`,
      `Detected risk IDs: ${risks.map((risk) => risk.id).join(", ")}`
    ]
  });
}

function evaluateVagueDeadline() {
  const plan = validPlan({
    members: ["Product Owner"],
    deliverables: ["Project brief"],
    deadline: "next Friday",
    risks: []
  });
  const risks = detectProjectRisks(plan);
  const ok = risks.some((risk) => risk.id === "derived-missing-deadline") && risks.some((risk) => risk.id === "derived-owner-text-fallback");

  return evalCase({
    name: "Vague deadline and text owner fallback",
    ok,
    behavior: "Keep the run usable, but surface deadline precision and owner mapping as visible risks.",
    evidence: `risks=${risks.map((risk) => risk.id).join(", ")}`,
    details: [
      `Deadline input: ${plan.deadline}`,
      `Detected risk IDs: ${risks.map((risk) => risk.id).join(", ")}`,
      `Owner fallback risk owner: ${risks.find((risk) => risk.id === "derived-owner-text-fallback")?.owner || "missing"}`
    ]
  });
}

function evaluateInvalidPlan() {
  const invalidPlan = {
    intent: "project_init",
    goal: "Broken planner output",
    members: "Product Owner",
    deliverables: [],
    deadline: "TBD",
    steps: [],
    confirmations: [],
    risks: []
  };
  const validation = validateProjectInitPlan(invalidPlan);
  const fallback = buildPlanValidationFallbackPlan("Broken planner output", validation.errors);
  const ok = !validation.ok && fallback.missing_info.includes("valid plan schema") && fallback.risks[0]?.level === "high";

  return evalCase({
    name: "Invalid planner schema",
    ok,
    behavior: "Return a clarification plan before confirmation, duplicate guard, or Feishu tool side effects.",
    evidence: `validation_errors=${validation.errors.length}`,
    details: [
      `Validation ok: ${validation.ok}`,
      `Validation paths: ${validation.errors.map((error) => error.path).join(", ")}`,
      `Fallback status prompt: ${fallback.confirmations[0].prompt}`
    ]
  });
}

async function evaluateDuplicateGuard(guardPath) {
  await rm(guardPath, { force: true });
  const plan = validPlan();
  const key = buildProjectInitDedupeKey({
    inputText: "Launch PilotFlow MVP",
    plan,
    profile: "pilotflow-contest",
    targets: {
      chatId: "oc_demo",
      baseToken: "base_demo",
      baseTableId: "tbl_demo"
    }
  });
  const guard = new DuplicateRunGuard({ filePath: guardPath, enabled: true });
  await guard.start({
    key,
    runId: "run-demo-eval-1",
    summary: duplicateGuardSummary({ plan, mode: "live", profile: "pilotflow-contest" })
  });
  await guard.mark({ key, runId: "run-demo-eval-1", status: "completed", artifacts: [{ id: "artifact-doc" }] });

  let duplicateError;
  try {
    await guard.start({ key, runId: "run-demo-eval-2", summary: {} });
  } catch (error) {
    duplicateError = error;
  }

  const ok = duplicateError?.code === "DUPLICATE_RUN_BLOCKED" && duplicateError.existingRun?.status === "completed";

  return evalCase({
    name: "Duplicate live run",
    ok,
    behavior: "Block repeated visible Feishu writes unless the operator explicitly bypasses the guard.",
    evidence: duplicateError ? duplicateError.code : "no duplicate error",
    details: [
      `Dedupe key format: ${key}`,
      `Existing run: ${duplicateError?.existingRun?.run_id || "missing"}`,
      `Existing artifact count: ${duplicateError?.existingRun?.artifact_count ?? "missing"}`
    ]
  });
}

function evaluateOptionalToolFailure() {
  const model = buildDemoEvidenceModel([
    { ts: "2026-04-29T00:00:00.000Z", run_id: "run-eval-tool-failure", event: "run.created", mode: "live" },
    { ts: "2026-04-29T00:00:01.000Z", run_id: "run-eval-tool-failure", event: "plan.generated", plan: validPlan() },
    {
      ts: "2026-04-29T00:00:02.000Z",
      run_id: "run-eval-tool-failure",
      event: "tool.failed",
      tool_call_id: "tool-6",
      tool: "announcement.update",
      error: { message: "API error: [232097] Unable to operate docx type chat announcement." }
    },
    {
      ts: "2026-04-29T00:00:03.000Z",
      run_id: "run-eval-tool-failure",
      event: "artifact.failed",
      tool_call_id: "tool-6",
      artifact: {
        type: "announcement",
        title: "PilotFlow group announcement",
        status: "failed",
        error: "API error: [232097] Unable to operate docx type chat announcement."
      }
    },
    {
      ts: "2026-04-29T00:00:04.000Z",
      run_id: "run-eval-tool-failure",
      event: "optional_tool.fallback",
      tool: "announcement.update",
      fallback: "continue_with_existing_project_entry_path",
      error: { message: "API error: [232097] Unable to operate docx type chat announcement." }
    },
    { ts: "2026-04-29T00:00:05.000Z", run_id: "run-eval-tool-failure", event: "run.completed" }
  ]);
  const ok = model.failedOptionalArtifacts.length === 1 && model.fallbacks[0]?.fallback === "continue_with_existing_project_entry_path";

  return evalCase({
    name: "Optional tool failure fallback",
    ok,
    behavior: "Record optional Feishu tool failure and continue through the stable project-entry path.",
    evidence: `failed_optional=${model.failedOptionalArtifacts.length}, fallbacks=${model.fallbacks.length}`,
    details: [
      `Run status: ${model.status}`,
      `Failed optional artifacts: ${model.failedOptionalArtifacts.map((artifact) => artifact.type).join(", ")}`,
      `Failure message: ${model.failedOptionalArtifacts[0]?.error || "missing"}`,
      `Fallback: ${model.fallbacks[0]?.fallback || "missing"}`
    ]
  });
}

function validPlan(overrides = {}) {
  return {
    intent: "project_init",
    goal: "Launch PilotFlow MVP for a Feishu-native project operations demo",
    members: ["Product Owner", "Agent Engineer"],
    deliverables: ["Project brief", "task board", "risk list", "final summary"],
    deadline: "2026-05-02",
    missing_info: [],
    steps: [
      { id: "step-doc", title: "Create project brief document", status: "pending", tool: "doc.create" },
      { id: "step-state", title: "Write project state", status: "pending", tool: "base.write" }
    ],
    confirmations: [
      {
        id: "confirm-takeoff",
        prompt: "Confirm the flight plan before PilotFlow writes project artifacts.",
        status: "pending",
        required_for: ["step-doc", "step-state"]
      }
    ],
    risks: [{ id: "risk-callback", title: "card callback delay", level: "medium", status: "open" }],
    ...overrides
  };
}

function evalCase({ name, ok, behavior, evidence, details }) {
  return {
    name,
    status: ok ? "pass" : "fail",
    behavior,
    evidence,
    details
  };
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
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-eval/DEMO_EVAL.md"),
    guardPath: resolve(typeof args["guard-path"] === "string" ? args["guard-path"] : "tmp/tests/demo-eval-guard.json")
  };
}

function buildUsage() {
  return `Usage:
  npm run demo:eval
  npm run demo:eval -- --output tmp/demo-eval/DEMO_EVAL.md

Options:
  --output <path>      Markdown evaluation report path.
  --guard-path <path>  Temporary duplicate guard store used by the duplicate-run case.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
