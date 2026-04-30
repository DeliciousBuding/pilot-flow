import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUTS = [
  {
    key: "readme",
    label: "Repository README",
    path: "README.md",
    anchor: "Feishu-native AI project operations officer",
    purpose: "Public product entrance."
  },
  {
    key: "roadmap",
    label: "Roadmap",
    path: "docs/ROADMAP.md",
    anchor: "Phase 3: Productization Cleanup",
    purpose: "Current product and engineering status."
  },
  {
    key: "playbook",
    label: "Demo playbook",
    path: "docs/demo/DEMO_PLAYBOOK.md",
    anchor: "6",
    purpose: "6 to 8 minute walkthrough script."
  },
  {
    key: "failurePaths",
    label: "Failure paths",
    path: "docs/demo/FAILURE_PATHS.md",
    anchor: "Fallback",
    purpose: "Reviewer-facing fallback and boundary language."
  },
  {
    key: "readiness",
    label: "Demo Readiness Pack",
    path: "tmp/demo-readiness/DEMO_READINESS.md",
    anchor: "ready_for_manual_capture",
    purpose: "Pre-recording readiness gate."
  },
  {
    key: "permissions",
    label: "Permission Appendix Pack",
    path: "tmp/demo-permissions/PERMISSION_APPENDIX.md",
    anchor: "Event subscribe dry-run",
    purpose: "Sanitized permission and callback configuration evidence."
  },
  {
    key: "evidence",
    label: "Demo Evidence Pack",
    path: "tmp/demo-evidence/DEMO_EVIDENCE.md",
    anchor: "Evidence Checklist",
    purpose: "Happy-path artifact evidence."
  },
  {
    key: "callback",
    label: "Callback Verification Pack",
    path: "tmp/demo-callback/CALLBACK_VERIFICATION.md",
    anchor: "blocked_on_platform_callback_event",
    purpose: "Callback readiness and pending-platform-event boundary."
  },
  {
    key: "failure",
    label: "Failure-Path Demo Pack",
    path: "tmp/demo-failure/FAILURE_DEMO.md",
    anchor: "DUPLICATE_RUN_BLOCKED",
    purpose: "Failure-path appendix."
  }
];

const CORE_CAPABILITIES = [
  ["IM entry", "Validated", "Group summary and project entry are sent back to Feishu IM."],
  ["Cards", "Validated with boundary", "Execution plan and risk cards send successfully; callback delivery still needs platform configuration proof."],
  ["Doc", "Validated", "Project brief creation is covered by the live run evidence."],
  ["Base", "Validated", "Rich Project State rows include owner, due date, risk, source, and URL fields."],
  ["Task", "Validated", "Task creation works, with optional owner open_id mapping and Contacts lookup."],
  ["Pinned entry", "Validated", "Pinned entry message is the stable project entrance while announcement API is blocked for this group."],
  ["Flight Recorder", "Prototype", "Local HTML view and JSONL traces explain every step, artifact, and fallback."],
  ["Risk handling", "Prototype validated", "Risk detector and risk decision card are included in the demo path."]
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoJudgePack(config);
  const markdown = renderDemoJudgeMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        readiness_status: pack.readinessStatus,
        source_ready_count: pack.sources.filter((item) => item.ready).length,
        source_count: pack.sources.length
      },
      null,
      2
    )
  );
}

export async function buildDemoJudgePack({
  inputOverrides = {},
  output = "tmp/demo-judge/JUDGE_REVIEW.md"
} = {}) {
  const sources = await Promise.all(
    DEFAULT_INPUTS.map((item) =>
      inspectSource({
        ...item,
        path: resolve(inputOverrides[item.key] || item.path)
      })
    )
  );
  const sourceByKey = Object.fromEntries(sources.map((item) => [item.key, item]));
  const readinessStatus = extractStatus(sourceByKey.readiness?.text, /Status:\s*`([^`]+)`/) || "not_collected";
  const permissionStatus = extractPermissionStatus(sourceByKey.permissions?.text);

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    readinessStatus,
    permissionStatus,
    sources: sources.map(({ text, ...item }) => item),
    coreCapabilities: CORE_CAPABILITIES,
    reviewerPath: buildReviewerPath(),
    proofPoints: buildProofPoints({ readinessStatus, permissionStatus }),
    knownBoundaries: buildKnownBoundaries(),
    recommendedCommands: buildRecommendedCommands(),
    nextActions: buildNextActions()
  };
}

export function renderDemoJudgeMarkdown(pack) {
  const lines = [
    "# PilotFlow Judge Review Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Readiness: \`${pack.readinessStatus}\``,
    `- Permission appendix: \`${pack.permissionStatus}\``,
    "",
    "## One-Line Product",
    "",
    "PilotFlow is a Feishu-native AI project operations officer that turns group-chat discussion into a confirmed project plan, Feishu Doc, Base/Task state, risk handling, stable group entry, and traceable delivery summary.",
    "",
    "## Reviewer Path",
    "",
    ...pack.reviewerPath.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Capability Snapshot",
    "",
    "| Capability | Status | Evidence summary |",
    "| --- | --- | --- |",
    ...pack.coreCapabilities.map(([capability, status, evidence]) => `| ${capability} | ${status} | ${escapeCell(evidence)} |`),
    "",
    "## Evidence Sources",
    "",
    "| Source | Status | Anchor | Path | Purpose |",
    "| --- | --- | --- | --- | --- |",
    ...pack.sources.map((item) => `| ${item.label} | ${item.ready ? "Ready" : "Missing"} | ${escapeCell(item.anchorStatus)} | \`${item.path}\` | ${escapeCell(item.purpose)} |`),
    "",
    "## Proof Points",
    "",
    ...pack.proofPoints.map((item) => `- ${item}`),
    "",
    "## Known Boundaries",
    "",
    ...pack.knownBoundaries.map((item) => `- ${item}`),
    "",
    "## Reproduction Commands",
    "",
    ...pack.recommendedCommands.map((item) => `- \`${item}\``),
    "",
    "## Next Actions",
    "",
    ...pack.nextActions.map((item) => `- [ ] ${item}`),
    "",
    "## Safety Notes",
    "",
    "- Do not commit raw screenshots, videos, tokens, App Secrets, verification tokens, encrypt keys, or private contact fields.",
    "- Keep raw live logs under ignored `tmp/` unless scrubbed and intentionally published.",
    "- Distinguish validated live surfaces from local prototypes and planned enhancements."
  ];

  return `${lines.join("\n")}\n`;
}

async function inspectSource(item) {
  const text = await readOptionalText(item.path);
  const ready = Boolean(text) && (!item.anchor || text.includes(item.anchor));
  return {
    ...item,
    text,
    ready,
    anchorStatus: !item.anchor ? "not required" : ready ? `found: ${item.anchor}` : `missing: ${item.anchor}`
  };
}

function buildReviewerPath() {
  return [
    "Start with the README for product positioning and current MVP status.",
    "Use the Demo Playbook for the 6 to 8 minute story.",
    "Open the Demo Readiness Pack to confirm evidence and docs are ready before recording.",
    "Open the Permission Appendix Pack for sanitized scope and callback-configuration evidence.",
    "Open the Callback Verification Pack to separate payload readiness, listener connection, and real event delivery.",
    "Use the Evidence Pack and Flight Recorder to explain live artifacts and fallback decisions.",
    "Use the Failure-Path Demo Pack for callback timeout, announcement fallback, invalid plan, duplicate run, and unclear-requirement cases."
  ];
}

function buildProofPoints({ readinessStatus, permissionStatus }) {
  return [
    `Readiness gate currently reports \`${readinessStatus}\`.`,
    `Permission appendix currently reports \`${permissionStatus}\`.`,
    "Latest enhanced live run created Doc, rich Base records, Task, risk card, pinned entry, final summary, and run trace.",
    "Announcement update is treated as optional and falls back to pinned entry on the current `232097` docx announcement API block.",
    "Card callback code path is implemented locally, but real callback delivery remains pending until `card.action.trigger` is captured."
  ];
}

function buildKnownBoundaries() {
  return [
    "This is an MVP prototype, not a production deployment.",
    "Card callback delivery remains pending and is not claimed as end-to-end verified yet.",
    "Group announcement is attempted but blocked for the current test group; pinned entry is the stable path.",
    "Manual recordings and screenshots still need to be captured outside the repository.",
    "Worker artifact, Whiteboard, Calendar, and multi-project capabilities remain roadmap items."
  ];
}

function buildRecommendedCommands() {
  return [
    "npm run pilot:check",
    "npm run pilot:demo",
    "npm run review:evidence -- --input tmp/runs/latest-live-run.jsonl --output tmp/demo-evidence/DEMO_EVIDENCE.md",
    "npm run review:eval -- --output tmp/demo-eval/DEMO_EVAL.md",
    "npm run review:capture -- --output tmp/demo-capture/CAPTURE_PACK.md",
    "npm run review:failure -- --output tmp/demo-failure/FAILURE_DEMO.md",
    "npm run review:readiness -- --output tmp/demo-readiness/DEMO_READINESS.md",
    "npm run review:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX.md",
    "npm run review:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION.md",
    "npm run review:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md"
  ];
}

function buildNextActions() {
  return [
    "Record happy-path walkthrough from the Feishu group.",
    "Record or screenshot failure-path appendix.",
    "Capture Open Platform permission and callback configuration screenshots.",
    "Regenerate Callback Verification Pack after each listener attempt.",
    "Run a bounded listener attempt after callback configuration changes.",
    "Keep README and docs updated when real callback delivery or recordings are added."
  ];
}

function extractStatus(text = "", pattern) {
  return text.match(pattern)?.[1] || "";
}

function extractPermissionStatus(text = "") {
  if (/Event subscribe dry-run \| ready/.test(text)) return "event_dry_run_ready";
  if (/Permission Appendix Pack/.test(text)) return "generated";
  return "not_collected";
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
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-judge/JUDGE_REVIEW.md"),
    inputOverrides: {
      readme: typeof args.readme === "string" ? args.readme : undefined,
      roadmap: typeof args.roadmap === "string" ? args.roadmap : undefined,
      playbook: typeof args.playbook === "string" ? args.playbook : undefined,
      failurePaths: typeof args["failure-paths"] === "string" ? args["failure-paths"] : undefined,
      readiness: typeof args.readiness === "string" ? args.readiness : undefined,
      permissions: typeof args.permissions === "string" ? args.permissions : undefined,
      callback: typeof args.callback === "string" ? args.callback : undefined,
      evidence: typeof args.evidence === "string" ? args.evidence : undefined,
      failure: typeof args.failure === "string" ? args.failure : undefined
    }
  };
}

function buildUsage() {
  return `Usage:
  npm run review:judge
  npm run review:judge -- --output tmp/demo-judge/JUDGE_REVIEW.md

Options:
  --readme <path>       README path.
  --roadmap <path>      Roadmap path.
  --playbook <path>     Demo playbook path.
  --failure-paths <path> Failure paths path.
  --readiness <path>    Demo Readiness Pack path.
  --permissions <path>  Permission Appendix Pack path.
  --callback <path>     Callback Verification Pack path.
  --evidence <path>     Demo Evidence Pack path.
  --failure <path>      Failure-Path Demo Pack path.
  --output <path>       Judge Review markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
