import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoCapturePack(config);
  const markdown = renderDemoCaptureMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        run_id: pack.runId,
        required_capture_count: pack.requiredCaptures.length,
        evidence_file_count: pack.evidenceFiles.filter((item) => item.exists).length
      },
      null,
      2
    )
  );
}

export async function buildDemoCapturePack({
  runLog = "tmp/runs/latest-live-run.jsonl",
  flightRecorder = "tmp/flight-recorder/latest-live-run.html",
  evidence = "tmp/demo-evidence/DEMO_EVIDENCE.md",
  evaluation = "tmp/demo-eval/DEMO_EVAL.md",
  output = "tmp/demo-capture/CAPTURE_PACK.md"
} = {}) {
  const paths = {
    runLog: resolve(runLog),
    flightRecorder: resolve(flightRecorder),
    evidence: resolve(evidence),
    evaluation: resolve(evaluation),
    output: resolve(output)
  };

  const evidenceText = await readOptionalText(paths.evidence);
  const evalText = await readOptionalText(paths.evaluation);
  const runId = extractRunId(evidenceText) || extractRunIdFromRunLog(await readOptionalText(paths.runLog)) || "unknown-run";

  return {
    generatedAt: new Date().toISOString(),
    runId,
    output: paths.output,
    evidenceFiles: [
      await fileEvidence("JSONL run log", paths.runLog, "Raw event stream for the live run."),
      await fileEvidence("Flight Recorder HTML", paths.flightRecorder, "Readable trace of plan, artifacts, tools, timeline, and errors."),
      await fileEvidence("Demo Evidence Pack", paths.evidence, "Scenario, checklist, artifacts, tool calls, and fallback summary."),
      await fileEvidence("Demo Evaluation Pack", paths.evaluation, "Local failure-path eval cases and pass/fail summary.")
    ],
    requiredCaptures: buildRequiredCaptures(),
    operatorChecklist: buildOperatorChecklist(),
    talkingPoints: buildTalkingPoints({ evalText })
  };
}

export function renderDemoCaptureMarkdown(pack) {
  const lines = [
    "# PilotFlow Demo Capture Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Run ID: \`${pack.runId}\``,
    "",
    "## Evidence Files",
    "",
    "| Evidence | Status | Path | Purpose |",
    "| --- | --- | --- | --- |",
    ...pack.evidenceFiles.map((item) => `| ${item.label} | ${item.exists ? "Ready" : "Missing"} | \`${item.path}\` | ${item.purpose} |`),
    "",
    "## Required Captures",
    "",
    "| Capture | Surface | Purpose | Evidence Anchor | Status |",
    "| --- | --- | --- | --- | --- |",
    ...pack.requiredCaptures.map((item) => `| ${item.title} | ${item.surface} | ${item.purpose} | ${item.anchor} | [ ] |`),
    "",
    "## Recording Order",
    "",
    ...pack.requiredCaptures.map((item, index) => `${index + 1}. ${item.title}: ${item.action}`),
    "",
    "## Operator Checklist",
    "",
    ...pack.operatorChecklist.map((item) => `- [ ] ${item}`),
    "",
    "## Talking Points",
    "",
    ...pack.talkingPoints.map((item) => `- ${item}`),
    "",
    "## Boundaries",
    "",
    "- This file is a capture plan, not proof that screenshots or videos already exist.",
    "- Do not commit screenshots containing secrets, access tokens, or private contact details.",
    "- Do not claim real card callback delivery until a `card.action.trigger` event is captured."
  ];

  return `${lines.join("\n")}\n`;
}

function buildRequiredCaptures() {
  return [
    {
      title: "Happy path group opening",
      surface: "Feishu group",
      purpose: "Show PilotFlow starts and finishes in the group where the team works.",
      anchor: "Final summary message and pinned entry",
      action: "Open the test group, show the execution plan card, risk card, pinned entry, and final summary."
    },
    {
      title: "Generated project brief",
      surface: "Feishu Doc",
      purpose: "Show the project narrative artifact created from the group intent.",
      anchor: "Doc URL from Evidence Pack",
      action: "Open the generated Doc and scan the goal, members, deliverables, deadline, and risks."
    },
    {
      title: "Structured project state",
      surface: "Feishu Base",
      purpose: "Show owner, due date, risk level, source run, source message, and URL fields.",
      anchor: "Base record IDs from Evidence Pack",
      action: "Open the Project State table and show tasks, risks, artifacts, and source fields."
    },
    {
      title: "Native task artifact",
      surface: "Feishu Task",
      purpose: "Show at least one concrete action item becomes a Feishu-native task.",
      anchor: "Task URL from Evidence Pack",
      action: "Open the task and show summary, due date, and owner fallback or assignee behavior."
    },
    {
      title: "Traceability view",
      surface: "Flight Recorder HTML",
      purpose: "Show PilotFlow records plan, artifacts, tool calls, timeline, and errors.",
      anchor: "Flight Recorder HTML",
      action: "Open the local Flight Recorder HTML and show the tool calls and fallback records."
    },
    {
      title: "Failure path evidence",
      surface: "Demo Evaluation Pack",
      purpose: "Show missing owner, vague deadline, invalid plan, duplicate run, and optional tool failure are covered.",
      anchor: "Demo Evaluation Pack",
      action: "Open the eval report and show all cases pass, including the `232097` announcement fallback."
    },
    {
      title: "Permission and callback appendix",
      surface: "Open Platform console / CLI output",
      purpose: "Show pending platform configuration without overstating readiness.",
      anchor: "Listener connected but no `card.action.trigger` received",
      action: "Capture app permissions, event subscription settings, and the bounded listener result."
    }
  ];
}

function buildOperatorChecklist() {
  return [
    "`npm run pilot:check` passes before recording.",
    "`npm run test:one -- eval` passes before recording.",
    "Latest Evidence Pack, Eval Pack, and Flight Recorder are generated.",
    "Feishu group, Doc, Base, Task, and local Flight Recorder are opened in tabs before recording.",
    "Secrets, app secret fields, access tokens, and private contact details are hidden.",
    "The speaker states that card callback delivery is not yet fully verified.",
    "The speaker states that group announcement falls back to pinned entry in the current test group.",
    "After recording, store video and screenshots outside the repo or under an ignored local evidence folder."
  ];
}

function buildTalkingPoints({ evalText }) {
  const evalPass = /Pass:\s*5/i.test(evalText) || /Pass:\s*`?5`?/i.test(evalText);
  return [
    "PilotFlow is Feishu-native: IM, card, Doc, Base, Task, pinned entry, and summary are the main surfaces.",
    "PilotFlow is controllable: human confirmation is required before visible write actions.",
    "PilotFlow is traceable: every run has JSONL, Flight Recorder, Evidence Pack, and Eval Pack evidence.",
    evalPass ? "The current local eval pack has five passing demo-risk cases." : "Run `npm run test:one -- eval` and regenerate the eval pack before presenting.",
    "Known limits are explicit: card callback delivery still needs platform configuration verification, and announcement update falls back on pinned entry for the current group."
  ];
}

async function fileEvidence(label, filePath, purpose) {
  return {
    label,
    path: filePath,
    exists: await pathExists(filePath),
    purpose
  };
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function extractRunId(text = "") {
  return text.match(/Run ID:\s*`([^`]+)`/)?.[1] || "";
}

function extractRunIdFromRunLog(text = "") {
  return text.match(/"run_id"\s*:\s*"([^"]+)"/)?.[1] || "";
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
    runLog: resolve(typeof args["run-log"] === "string" ? args["run-log"] : "tmp/runs/latest-live-run.jsonl"),
    flightRecorder: resolve(typeof args["flight-recorder"] === "string" ? args["flight-recorder"] : "tmp/flight-recorder/latest-live-run.html"),
    evidence: resolve(typeof args.evidence === "string" ? args.evidence : "tmp/demo-evidence/DEMO_EVIDENCE.md"),
    evaluation: resolve(typeof args.evaluation === "string" ? args.evaluation : "tmp/demo-eval/DEMO_EVAL.md"),
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-capture/CAPTURE_PACK.md")
  };
}

function buildUsage() {
  return `Usage:
  npm run review:capture
  npm run review:capture -- --output tmp/demo-capture/CAPTURE_PACK.md

Options:
  --run-log <path>          JSONL run log path.
  --flight-recorder <path>  Flight Recorder HTML path.
  --evidence <path>         Demo Evidence Pack markdown path.
  --evaluation <path>       Demo Evaluation Pack markdown path.
  --output <path>           Capture pack markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
