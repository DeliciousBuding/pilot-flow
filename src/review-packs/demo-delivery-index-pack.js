import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCES = [
  {
    key: "readme",
    group: "public_docs",
    label: "Repository README",
    path: "README.md",
    anchor: "Feishu-native AI project operations officer",
    required: true,
    purpose: "Public product entrance and status snapshot."
  },
  {
    key: "docsIndex",
    group: "public_docs",
    label: "Docs index",
    path: "docs/README.md",
    anchor: "PilotFlow",
    required: true,
    purpose: "Documentation map for product, architecture, development, and demo material."
  },
  {
    key: "demoKit",
    group: "public_docs",
    label: "Demo kit index",
    path: "docs/demo/README.md",
    anchor: "PilotFlow Demo Kit",
    required: true,
    purpose: "Reviewer and operator-facing demo material index."
  },
  {
    key: "playbook",
    group: "public_docs",
    label: "Demo playbook",
    path: "docs/demo/DEMO_PLAYBOOK.md",
    anchor: "6",
    required: true,
    purpose: "6 to 8 minute walkthrough script."
  },
  {
    key: "captureGuide",
    group: "public_docs",
    label: "Capture guide",
    path: "docs/demo/CAPTURE_GUIDE.md",
    anchor: "Required Captures",
    required: true,
    purpose: "Recording, screenshot, submission, and safety checklist."
  },
  {
    key: "failurePaths",
    group: "public_docs",
    label: "Failure paths",
    path: "docs/demo/FAILURE_PATHS.md",
    anchor: "Fallback",
    required: true,
    purpose: "Known platform limits, fallback behavior, and Q&A boundaries."
  },
  {
    key: "readiness",
    group: "machine_evidence",
    label: "Demo Readiness Pack",
    path: "tmp/demo-readiness/DEMO_READINESS.md",
    anchor: "ready_for_manual_capture",
    required: true,
    purpose: "Evidence and public-doc readiness gate."
  },
  {
    key: "judge",
    group: "machine_evidence",
    label: "Judge Review Pack",
    path: "tmp/demo-judge/JUDGE_REVIEW.md",
    anchor: "PilotFlow Judge Review Pack",
    required: true,
    purpose: "Single reviewer entry pack for product story, evidence, boundaries, and commands."
  },
  {
    key: "submission",
    group: "machine_evidence",
    label: "Demo Submission Pack",
    path: "tmp/demo-submission/SUBMISSION_PACK.md",
    anchor: "PilotFlow Demo Submission Pack",
    required: true,
    purpose: "Final machine-evidence and manual-capture status."
  },
  {
    key: "callback",
    group: "machine_evidence",
    label: "Callback Verification Pack",
    path: "tmp/demo-callback/CALLBACK_VERIFICATION.md",
    anchor: "Verification status",
    required: true,
    purpose: "Card payload, listener connection, and real callback-event status."
  },
  {
    key: "permissions",
    group: "machine_evidence",
    label: "Permission Appendix Pack",
    path: "tmp/demo-permissions/PERMISSION_APPENDIX.md",
    anchor: "Event subscribe dry-run",
    required: true,
    purpose: "Sanitized CLI, scope, screenshot, and callback-configuration checklist."
  },
  {
    key: "capture",
    group: "machine_evidence",
    label: "Demo Capture Pack",
    path: "tmp/demo-capture/CAPTURE_PACK.md",
    anchor: "Required Captures",
    required: true,
    purpose: "Recording order, screenshot list, evidence anchors, and spoken boundaries."
  },
  {
    key: "failure",
    group: "machine_evidence",
    label: "Failure-Path Demo Pack",
    path: "tmp/demo-failure/FAILURE_DEMO.md",
    anchor: "DUPLICATE_RUN_BLOCKED",
    required: true,
    purpose: "Callback timeout, announcement fallback, invalid plan, duplicate run, and unclear-requirement evidence."
  },
  {
    key: "evidence",
    group: "machine_evidence",
    label: "Demo Evidence Pack",
    path: "tmp/demo-evidence/DEMO_EVIDENCE.md",
    anchor: "Evidence Checklist",
    required: true,
    purpose: "Happy-path artifacts and tool-call evidence."
  },
  {
    key: "evaluation",
    group: "machine_evidence",
    label: "Demo Evaluation Pack",
    path: "tmp/demo-eval/DEMO_EVAL.md",
    anchor: "232097",
    required: true,
    purpose: "Local risk and fallback evaluation cases."
  },
  {
    key: "flightRecorder",
    group: "machine_evidence",
    label: "Flight Recorder HTML",
    path: "tmp/flight-recorder/latest-live-run.html",
    anchor: "PilotFlow Flight Recorder",
    required: true,
    purpose: "Readable trace for plans, tool calls, artifacts, failures, and fallback decisions."
  },
  {
    key: "runLog",
    group: "machine_evidence",
    label: "Live JSONL run log",
    path: "tmp/runs/latest-live-run.jsonl",
    anchor: "run.completed",
    required: true,
    purpose: "Raw run trace backing the generated reports."
  }
];

const OPENING_ORDER = [
  "README",
  "Judge Review Pack",
  "Demo Playbook",
  "Demo Readiness Pack",
  "Demo Submission Pack",
  "Permission Appendix Pack",
  "Callback Verification Pack",
  "Flight Recorder HTML",
  "Failure-Path Demo Pack"
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoDeliveryIndexPack(config);
  const markdown = renderDemoDeliveryIndexMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        delivery_status: pack.status,
        readiness_status: pack.readinessStatus,
        submission_status: pack.submissionStatus,
        required_ready_count: pack.summary.requiredReady,
        required_count: pack.summary.requiredTotal
      },
      null,
      2
    )
  );
}

export async function buildDemoDeliveryIndexPack({
  sourceOverrides = {},
  output = "tmp/demo-delivery/DELIVERY_INDEX.md"
} = {}) {
  const sources = await Promise.all(
    DEFAULT_SOURCES.map((item) =>
      inspectSource({
        ...item,
        path: resolve(sourceOverrides[item.key] || item.path)
      })
    )
  );
  const sourceByKey = Object.fromEntries(sources.map((item) => [item.key, item]));
  const required = sources.filter((item) => item.required);
  const requiredReady = required.filter((item) => item.ready).length;
  const readinessStatus = extractStatus(sourceByKey.readiness?.text, /Status:\s*`([^`]+)`/) || "not_collected";
  const submissionStatus = extractStatus(sourceByKey.submission?.text, /Status:\s*`([^`]+)`/) || "not_collected";
  const manualCaptures = extractManualCaptureSummary(sourceByKey.submission?.text);
  const callbackStatus = extractStatus(sourceByKey.callback?.text, /Verification status:\s*`([^`]+)`/) || "not_collected";
  const status = deriveDeliveryStatus({
    requiredReady,
    requiredTotal: required.length,
    submissionStatus
  });

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    status,
    readinessStatus,
    submissionStatus,
    callbackStatus,
    manualCaptures,
    summary: {
      requiredReady,
      requiredTotal: required.length,
      publicDocsReady: countReady(sources, "public_docs"),
      publicDocsTotal: countTotal(sources, "public_docs"),
      machineEvidenceReady: countReady(sources, "machine_evidence"),
      machineEvidenceTotal: countTotal(sources, "machine_evidence")
    },
    sources: sources.map(({ text, ...item }) => item),
    openingOrder: OPENING_ORDER,
    recommendedCommands: buildRecommendedCommands(),
    nextActions: buildNextActions({ status, submissionStatus, callbackStatus })
  };
}

export function renderDemoDeliveryIndexMarkdown(pack) {
  const lines = [
    "# PilotFlow Demo Delivery Index",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Status: \`${pack.status}\``,
    `- Readiness: \`${pack.readinessStatus}\``,
    `- Submission: \`${pack.submissionStatus}\``,
    `- Callback: \`${pack.callbackStatus}\``,
    `- Manual captures: ${pack.manualCaptures.ready}/${pack.manualCaptures.total}`,
    "",
    "## Summary",
    "",
    "| Area | Ready | Total |",
    "| --- | --- | --- |",
    `| Required sources | ${pack.summary.requiredReady} | ${pack.summary.requiredTotal} |`,
    `| Public docs | ${pack.summary.publicDocsReady} | ${pack.summary.publicDocsTotal} |`,
    `| Machine evidence | ${pack.summary.machineEvidenceReady} | ${pack.summary.machineEvidenceTotal} |`,
    "",
    "## Recommended Opening Order",
    "",
    ...pack.openingOrder.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Source Matrix",
    "",
    "| Source | Group | Status | Anchor | Path | Purpose |",
    "| --- | --- | --- | --- | --- | --- |",
    ...pack.sources.map((item) => `| ${item.label} | ${item.group} | ${item.ready ? "Ready" : "Missing"} | ${escapeCell(item.anchorStatus)} | \`${item.path}\` | ${escapeCell(item.purpose)} |`),
    "",
    "## Commands",
    "",
    ...pack.recommendedCommands.map((item) => `- \`${item}\``),
    "",
    "## Next Actions",
    "",
    ...pack.nextActions.map((item) => `- [ ] ${item}`),
    "",
    "## Boundaries",
    "",
    "- This index points to local generated evidence under ignored `tmp/`; it is not a public artifact by itself.",
    "- Raw recordings and screenshots should stay outside Git unless intentionally scrubbed and published.",
    "- Keep card callback delivery marked as pending until a real `card.action.trigger` event is captured.",
    "- Keep group announcement described as attempted with pinned-entry fallback for the current test group."
  ];

  return `${lines.join("\n")}\n`;
}

async function inspectSource(item) {
  const text = await readOptionalText(item.path);
  const exists = Boolean(text);
  const anchorFound = exists && (!item.anchor || text.includes(item.anchor));
  return {
    ...item,
    exists,
    ready: exists && anchorFound,
    anchorStatus: !item.anchor ? "not required" : anchorFound ? `found: ${item.anchor}` : `missing: ${item.anchor}`,
    text
  };
}

function deriveDeliveryStatus({ requiredReady, requiredTotal, submissionStatus }) {
  if (requiredReady !== requiredTotal) return "needs_regeneration";
  if (submissionStatus === "ready_for_submission_review") return "ready_for_submission_review";
  return "ready_for_manual_capture";
}

function extractStatus(text = "", pattern) {
  return text.match(pattern)?.[1] || "";
}

function extractManualCaptureSummary(text = "") {
  const match = text.match(/Manual captures:\s*(\d+)\/(\d+)/);
  return {
    ready: match ? Number(match[1]) : 0,
    total: match ? Number(match[2]) : 0
  };
}

function countReady(sources, group) {
  return sources.filter((item) => item.group === group && item.ready).length;
}

function countTotal(sources, group) {
  return sources.filter((item) => item.group === group).length;
}

function buildRecommendedCommands() {
  return [
    "npm run review:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md",
    "npm run review:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md",
    "npm run review:submission -- --output tmp/demo-submission/SUBMISSION_PACK.md",
    "npm run review:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX.md"
  ];
}

function buildNextActions({ status, submissionStatus, callbackStatus }) {
  if (status === "needs_regeneration") {
    return [
      "Regenerate missing machine evidence review.",
      "Rerun the delivery index after readiness, judge, submission, and callback review are current."
    ];
  }

  const actions = [];
  if (submissionStatus !== "ready_for_submission_review") {
    actions.push("Collect happy-path recording, failure-path media, permission screenshots, and callback proof, then rerun the submission pack with a capture manifest.");
  }
  if (callbackStatus !== "verified_with_real_callback_event") {
    actions.push("Keep callback delivery as pending until a real `card.action.trigger` event is captured.");
  }
  actions.push("Use this delivery index as the local operator start page before review packaging.");
  return actions;
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
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-delivery/DELIVERY_INDEX.md"),
    sourceOverrides: Object.fromEntries(
      Object.keys(args)
        .filter((key) => key !== "output" && key !== "help" && key !== "h")
        .map((key) => [toCamelCase(key), args[key]])
        .filter(([, value]) => typeof value === "string")
    )
  };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function buildUsage() {
  return `Usage:
  npm run review:delivery-index
  npm run review:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX.md

Options:
  --readme <path>             Repository README path.
  --docs-index <path>         Docs index path.
  --demo-kit <path>           Demo kit index path.
  --playbook <path>           Demo playbook path.
  --capture-guide <path>      Capture guide path.
  --failure-paths <path>      Failure paths path.
  --readiness <path>          Demo Readiness Pack path.
  --judge <path>              Judge Review Pack path.
  --submission <path>         Demo Submission Pack path.
  --callback <path>           Callback Verification Pack path.
  --permissions <path>        Permission Appendix Pack path.
  --capture <path>            Demo Capture Pack path.
  --failure <path>            Failure-Path Demo Pack path.
  --evidence <path>           Demo Evidence Pack path.
  --evaluation <path>         Demo Evaluation Pack path.
  --flight-recorder <path>    Flight Recorder HTML path.
  --run-log <path>            Live JSONL run log path.
  --output <path>             Delivery index markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
