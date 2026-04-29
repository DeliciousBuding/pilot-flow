import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_EVIDENCE_FILES = [
  {
    key: "runLog",
    label: "Live JSONL run log",
    path: "tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl",
    required: true,
    anchor: "run.completed",
    purpose: "Raw trace for the enhanced live Feishu run."
  },
  {
    key: "flightRecorder",
    label: "Flight Recorder HTML",
    path: "tmp/flight-recorder/announcement-upgrade-live-20260429-fixed.html",
    required: true,
    anchor: "PilotFlow Flight Recorder",
    purpose: "Readable trace for plan, tool calls, artifacts, timeline, and fallback records."
  },
  {
    key: "evidence",
    label: "Demo Evidence Pack",
    path: "tmp/demo-evidence/DEMO_EVIDENCE_20260429.md",
    required: true,
    anchor: "Evidence Checklist",
    purpose: "Happy-path artifacts and tool-call evidence."
  },
  {
    key: "evaluation",
    label: "Demo Evaluation Pack",
    path: "tmp/demo-eval/DEMO_EVAL_20260429.md",
    required: true,
    anchor: "232097",
    purpose: "Risk and fallback evaluation cases."
  },
  {
    key: "capture",
    label: "Demo Capture Pack",
    path: "tmp/demo-capture/CAPTURE_PACK_20260429.md",
    required: true,
    anchor: "Required Captures",
    purpose: "Recording order and screenshot checklist."
  },
  {
    key: "failure",
    label: "Failure-Path Demo Pack",
    path: "tmp/demo-failure/FAILURE_DEMO_20260429.md",
    required: true,
    anchor: "DUPLICATE_RUN_BLOCKED",
    purpose: "Failure-path appendix for callback timeout, announcement fallback, invalid plan, duplicate run, and unclear requirements."
  },
  {
    key: "permissions",
    label: "Permission Appendix Pack",
    path: "tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md",
    required: true,
    anchor: "Event subscribe dry-run",
    purpose: "Sanitized CLI, scope, screenshot, and callback-configuration evidence."
  },
  {
    key: "callback",
    label: "Callback Verification Pack",
    path: "tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md",
    required: true,
    anchor: "blocked_on_platform_callback_event",
    purpose: "Card payload, bounded listener, and real callback-event status."
  }
];

const DEFAULT_DOC_FILES = [
  {
    label: "Demo playbook",
    path: "docs/demo/DEMO_PLAYBOOK.md",
    anchor: "6",
    purpose: "Operator script for a 6 to 8 minute walkthrough."
  },
  {
    label: "Demo Q&A",
    path: "docs/demo/DEMO_QA.md",
    anchor: "PilotFlow",
    purpose: "Reviewer-facing answers."
  },
  {
    label: "Failure paths",
    path: "docs/demo/FAILURE_PATHS.md",
    anchor: "fallback",
    purpose: "Known platform limits and fallback explanations."
  },
  {
    label: "Evaluation workflow",
    path: "docs/demo/EVALUATION.md",
    anchor: "demo:eval",
    purpose: "Runnable local evaluation workflow."
  },
  {
    label: "Capture guide",
    path: "docs/demo/CAPTURE_GUIDE.md",
    anchor: "demo:capture",
    purpose: "Recording and screenshot capture guide."
  },
  {
    label: "Failure demo guide",
    path: "docs/demo/FAILURE_DEMO.md",
    anchor: "demo:failure",
    purpose: "Failure-path demo workflow and boundaries."
  },
  {
    label: "Permission appendix guide",
    path: "docs/demo/PERMISSIONS.md",
    anchor: "demo:permissions",
    purpose: "Permission and callback appendix workflow."
  },
  {
    label: "Callback verification guide",
    path: "docs/demo/CALLBACK_VERIFICATION.md",
    anchor: "demo:callback-verification",
    purpose: "Callback readiness report workflow and status meanings."
  }
];

const MANUAL_CAPTURE_ITEMS = [
  {
    label: "Happy-path walkthrough recording",
    status: "manual_pending",
    owner: "demo operator",
    evidence: "Use Capture Pack recording order."
  },
  {
    label: "Failure-path walkthrough recording or screenshot set",
    status: "manual_pending",
    owner: "demo operator",
    evidence: "Use Failure-Path Demo Pack scenarios."
  },
  {
    label: "Open Platform permission screenshots",
    status: "manual_pending",
    owner: "demo operator",
    evidence: "Capture API scopes and event/callback configuration pages."
  },
  {
    label: "Callback configuration proof",
    status: "manual_pending",
    owner: "demo operator",
    evidence: "Capture listener result or real `card.action.trigger` delivery once verified."
  }
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoReadinessPack(config);
  const markdown = renderDemoReadinessMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        readiness_status: pack.status,
        required_ready_count: pack.summary.requiredReady,
        required_count: pack.summary.requiredTotal,
        manual_pending_count: pack.manualCaptures.length
      },
      null,
      2
    )
  );
}

export async function buildDemoReadinessPack({
  evidenceOverrides = {},
  docOverrides = {},
  output = "tmp/demo-readiness/DEMO_READINESS.md"
} = {}) {
  const evidenceFiles = await Promise.all(
    DEFAULT_EVIDENCE_FILES.map((item) =>
      inspectFileEvidence({
        ...item,
        path: resolve(evidenceOverrides[item.key] || item.path)
      })
    )
  );
  const docs = await Promise.all(
    DEFAULT_DOC_FILES.map((item) =>
      inspectFileEvidence({
        ...item,
        path: resolve(docOverrides[item.label] || item.path),
        required: true
      })
    )
  );
  const requiredItems = [...evidenceFiles, ...docs].filter((item) => item.required);
  const requiredReady = requiredItems.filter((item) => item.ready).length;
  const status = requiredReady === requiredItems.length ? "ready_for_manual_capture" : "needs_regeneration";

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    status,
    summary: {
      requiredReady,
      requiredTotal: requiredItems.length,
      evidenceReady: evidenceFiles.filter((item) => item.ready).length,
      evidenceTotal: evidenceFiles.length,
      docsReady: docs.filter((item) => item.ready).length,
      docsTotal: docs.length
    },
    evidenceFiles,
    docs,
    manualCaptures: MANUAL_CAPTURE_ITEMS,
    recommendedCommands: buildRecommendedCommands({ status }),
    nextActions: buildNextActions({ status })
  };
}

export function renderDemoReadinessMarkdown(pack) {
  const lines = [
    "# PilotFlow Demo Readiness Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Status: \`${pack.status}\``,
    `- Required ready: ${pack.summary.requiredReady}/${pack.summary.requiredTotal}`,
    "",
    "## Readiness Summary",
    "",
    "| Area | Ready | Total |",
    "| --- | --- | --- |",
    `| Evidence files | ${pack.summary.evidenceReady} | ${pack.summary.evidenceTotal} |`,
    `| Demo docs | ${pack.summary.docsReady} | ${pack.summary.docsTotal} |`,
    `| Manual capture items | 0 | ${pack.manualCaptures.length} |`,
    "",
    "## Evidence Files",
    "",
    "| Evidence | Status | Anchor | Path | Purpose |",
    "| --- | --- | --- | --- | --- |",
    ...pack.evidenceFiles.map((item) => `| ${item.label} | ${item.ready ? "Ready" : "Missing"} | ${escapeCell(item.anchorStatus)} | \`${item.path}\` | ${escapeCell(item.purpose)} |`),
    "",
    "## Demo Docs",
    "",
    "| Document | Status | Anchor | Path | Purpose |",
    "| --- | --- | --- | --- | --- |",
    ...pack.docs.map((item) => `| ${item.label} | ${item.ready ? "Ready" : "Missing"} | ${escapeCell(item.anchorStatus)} | \`${item.path}\` | ${escapeCell(item.purpose)} |`),
    "",
    "## Manual Capture Items",
    "",
    "| Item | Status | Owner | Evidence Target |",
    "| --- | --- | --- | --- |",
    ...pack.manualCaptures.map((item) => `| ${item.label} | ${item.status} | ${item.owner} | ${escapeCell(item.evidence)} |`),
    "",
    "## Recommended Commands",
    "",
    ...pack.recommendedCommands.map((item) => `- \`${item}\``),
    "",
    "## Next Actions",
    "",
    ...pack.nextActions.map((item) => `- [ ] ${item}`),
    "",
    "## Boundaries",
    "",
    "- This pack is a readiness gate. It does not prove that videos or screenshots already exist.",
    "- Do not commit raw videos, screenshots with secrets, access tokens, or private contact details.",
    "- Keep callback delivery marked as pending until a real `card.action.trigger` event is captured.",
    "- Keep group announcement described as attempted with pinned-entry fallback for the current test group."
  ];

  return `${lines.join("\n")}\n`;
}

async function inspectFileEvidence(item) {
  const text = await readOptionalText(item.path);
  const exists = Boolean(text);
  const anchorFound = exists && (!item.anchor || text.includes(item.anchor));

  return {
    ...item,
    exists,
    anchorFound,
    ready: exists && anchorFound,
    anchorStatus: !item.anchor ? "not required" : anchorFound ? `found: ${item.anchor}` : `missing: ${item.anchor}`
  };
}

function buildRecommendedCommands({ status }) {
  const base = [
    "npm run pilot:check",
    "npm run demo:evidence -- --input tmp/runs/announcement-upgrade-live-20260429-fixed.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE_20260429.md",
    "npm run demo:eval -- --output tmp/demo-eval/DEMO_EVAL_20260429.md",
    "npm run demo:capture -- --output tmp/demo-capture/CAPTURE_PACK_20260429.md",
    "npm run demo:failure -- --output tmp/demo-failure/FAILURE_DEMO_20260429.md",
    "npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md",
    "npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md",
    "npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS_20260429.md"
  ];

  if (status !== "ready_for_manual_capture") {
    return base;
  }

  return [
    ...base,
    "npm run listen:cards -- --dry-run --max-events 1 --timeout 30s"
  ];
}

function buildNextActions({ status }) {
  if (status !== "ready_for_manual_capture") {
    return [
      "Regenerate missing evidence packs before recording.",
      "Open the generated readiness report and fix missing anchors.",
      "Rerun `npm run demo:readiness` until required files are ready."
    ];
  }

  return [
    "Record the happy-path walkthrough from the Feishu group.",
    "Record or screenshot the failure-path appendix.",
    "Capture Open Platform permission and callback configuration pages.",
    "Run one bounded callback listener attempt and save the result for the appendix.",
    "Keep text confirmation and pinned-entry fallback in the spoken demo boundary."
  ];
}

async function readOptionalText(filePath) {
  try {
    await access(filePath, constants.R_OK);
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
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-readiness/DEMO_READINESS.md"),
    evidenceOverrides: {
      runLog: typeof args["run-log"] === "string" ? args["run-log"] : undefined,
      flightRecorder: typeof args["flight-recorder"] === "string" ? args["flight-recorder"] : undefined,
      evidence: typeof args.evidence === "string" ? args.evidence : undefined,
      evaluation: typeof args.evaluation === "string" ? args.evaluation : undefined,
      capture: typeof args.capture === "string" ? args.capture : undefined,
      failure: typeof args.failure === "string" ? args.failure : undefined,
      permissions: typeof args.permissions === "string" ? args.permissions : undefined,
      callback: typeof args.callback === "string" ? args.callback : undefined
    }
  };
}

function buildUsage() {
  return `Usage:
  npm run demo:readiness
  npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md

Options:
  --run-log <path>          Live JSONL run log.
  --flight-recorder <path>  Flight Recorder HTML.
  --evidence <path>         Demo Evidence Pack markdown.
  --evaluation <path>       Demo Evaluation Pack markdown.
  --capture <path>          Demo Capture Pack markdown.
  --failure <path>          Failure-Path Demo Pack markdown.
  --permissions <path>      Permission Appendix Pack markdown.
  --callback <path>         Callback Verification Pack markdown.
  --output <path>           Readiness markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
