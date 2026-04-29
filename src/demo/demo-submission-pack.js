import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SOURCE_FILES = [
  {
    key: "readiness",
    label: "Demo Readiness Pack",
    path: "tmp/demo-readiness/DEMO_READINESS_20260429.md",
    anchor: "ready_for_manual_capture",
    purpose: "Machine evidence and public demo docs gate."
  },
  {
    key: "judge",
    label: "Judge Review Pack",
    path: "tmp/demo-judge/JUDGE_REVIEW_20260429.md",
    anchor: "PilotFlow Judge Review Pack",
    purpose: "Reviewer-facing product story, evidence, commands, and boundaries."
  },
  {
    key: "callback",
    label: "Callback Verification Pack",
    path: "tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md",
    anchor: "Verification status",
    purpose: "Card payload, listener connection, and real callback-event status."
  },
  {
    key: "capture",
    label: "Demo Capture Pack",
    path: "tmp/demo-capture/CAPTURE_PACK_20260429.md",
    anchor: "Required Captures",
    purpose: "Recording order, screenshot checklist, and evidence anchors."
  },
  {
    key: "permissions",
    label: "Permission Appendix Pack",
    path: "tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md",
    anchor: "Event subscribe dry-run",
    purpose: "Sanitized CLI and permission/callback screenshot checklist."
  },
  {
    key: "failure",
    label: "Failure-Path Demo Pack",
    path: "tmp/demo-failure/FAILURE_DEMO_20260429.md",
    anchor: "DUPLICATE_RUN_BLOCKED",
    purpose: "Failure-path appendix and fallback evidence."
  }
];

const DEFAULT_MANUAL_CAPTURES = [
  {
    label: "Happy-path walkthrough recording",
    type: "video",
    required: true,
    status: "pending",
    path: "",
    redacted: false,
    notes: "Use the Capture Pack happy-path sequence."
  },
  {
    label: "Failure-path walkthrough recording or screenshots",
    type: "video_or_screenshots",
    required: true,
    status: "pending",
    path: "",
    redacted: false,
    notes: "Use the Failure-Path Demo Pack scenarios."
  },
  {
    label: "Open Platform permission screenshots",
    type: "screenshots",
    required: true,
    status: "pending",
    path: "",
    redacted: false,
    notes: "Hide App Secret, verification token, encrypt key, and request URLs."
  },
  {
    label: "Callback configuration proof",
    type: "screenshots_or_listener_log",
    required: true,
    status: "pending",
    path: "",
    redacted: false,
    notes: "Show callback configuration or a real card.action.trigger listener capture."
  }
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoSubmissionPack(config);
  const markdown = renderDemoSubmissionMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        submission_status: pack.status,
        source_ready_count: pack.summary.sourceReady,
        source_count: pack.summary.sourceTotal,
        manual_ready_count: pack.summary.manualReady,
        manual_required_count: pack.summary.manualRequired
      },
      null,
      2
    )
  );
}

export async function buildDemoSubmissionPack({
  sourceOverrides = {},
  captureManifest = "",
  output = "tmp/demo-submission/SUBMISSION_PACK.md"
} = {}) {
  const sources = await Promise.all(
    DEFAULT_SOURCE_FILES.map((item) =>
      inspectSource({
        ...item,
        path: resolve(sourceOverrides[item.key] || item.path)
      })
    )
  );
  const manualCaptures = await loadManualCaptures(captureManifest);
  const sourceReady = sources.filter((item) => item.ready).length;
  const manualRequired = manualCaptures.filter((item) => item.required !== false).length;
  const manualReady = manualCaptures.filter((item) => item.required !== false && item.ready).length;
  const status = deriveStatus({ sourceReady, sourceTotal: sources.length, manualReady, manualRequired });

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    status,
    captureManifest: captureManifest ? resolve(captureManifest) : "",
    summary: {
      sourceReady,
      sourceTotal: sources.length,
      manualReady,
      manualRequired
    },
    sources,
    manualCaptures,
    recommendedCommands: buildRecommendedCommands(),
    nextActions: buildNextActions({ status })
  };
}

export function renderDemoSubmissionMarkdown(pack) {
  const lines = [
    "# PilotFlow Demo Submission Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Status: \`${pack.status}\``,
    `- Machine evidence: ${pack.summary.sourceReady}/${pack.summary.sourceTotal}`,
    `- Manual captures: ${pack.summary.manualReady}/${pack.summary.manualRequired}`,
    pack.captureManifest ? `- Capture manifest: \`${pack.captureManifest}\`` : "- Capture manifest: `not provided`",
    "",
    "## Source Evidence",
    "",
    "| Source | Status | Anchor | Path | Purpose |",
    "| --- | --- | --- | --- | --- |",
    ...pack.sources.map((item) => `| ${item.label} | ${item.ready ? "Ready" : "Missing"} | ${escapeCell(item.anchorStatus)} | \`${item.path}\` | ${escapeCell(item.purpose)} |`),
    "",
    "## Manual Capture Manifest",
    "",
    "| Capture | Status | Type | Redacted | Path | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...pack.manualCaptures.map((item) => `| ${item.label} | ${item.ready ? "Ready" : item.status} | ${item.type || "unknown"} | ${item.redacted ? "yes" : "no"} | ${item.path ? `\`${item.path}\`` : "not provided"} | ${escapeCell(item.notes)} |`),
    "",
    "## Recommended Commands",
    "",
    ...pack.recommendedCommands.map((item) => `- \`${item}\``),
    "",
    "## Next Actions",
    "",
    ...pack.nextActions.map((item) => `- [ ] ${item}`),
    "",
    "## Submission Boundary",
    "",
    "- This pack does not store videos or screenshots in the repository.",
    "- Capture files should stay outside Git unless they are scrubbed and intentionally published.",
    "- A pending callback event should remain documented as pending even if card payloads and listener wiring are ready.",
    "- Do not include App Secret, access tokens, verification tokens, encrypt keys, request URLs, or private contact fields in screenshots."
  ];

  return `${lines.filter(Boolean).join("\n")}\n`;
}

async function inspectSource(item) {
  const text = await readOptionalText(item.path);
  const ready = Boolean(text) && (!item.anchor || text.includes(item.anchor));
  return {
    ...item,
    ready,
    anchorStatus: !item.anchor ? "not required" : ready ? `found: ${item.anchor}` : `missing: ${item.anchor}`
  };
}

async function loadManualCaptures(captureManifest) {
  if (!captureManifest) return DEFAULT_MANUAL_CAPTURES.map((item) => ({ ...item, ready: false }));

  const text = await readFile(resolve(captureManifest), "utf8");
  const parsed = JSON.parse(text);
  const entries = Array.isArray(parsed.captures) ? parsed.captures : [];
  const byLabel = new Map(entries.map((item) => [item.label, item]));

  return Promise.all(
    DEFAULT_MANUAL_CAPTURES.map(async (requiredItem) => {
      const override = byLabel.get(requiredItem.label) || {};
      const item = {
        ...requiredItem,
        ...override,
        path: override.path ? resolve(override.path) : "",
        redacted: override.redacted === true
      };
      const exists = item.path ? await fileExists(item.path) : false;
      const ready = item.status === "ready" && exists && item.redacted;
      return {
        ...item,
        exists,
        ready,
        notes: item.notes || requiredItem.notes
      };
    })
  );
}

function deriveStatus({ sourceReady, sourceTotal, manualReady, manualRequired }) {
  if (sourceReady !== sourceTotal) return "needs_regeneration";
  if (manualReady === manualRequired) return "ready_for_submission_review";
  return "machine_ready_manual_capture_pending";
}

function buildRecommendedCommands() {
  return [
    "npm run demo:permissions -- --collect-version --collect-auth --collect-event-dry-run --output tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md",
    "npm run demo:callback-verification -- --output tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md",
    "npm run demo:readiness -- --output tmp/demo-readiness/DEMO_READINESS_20260429.md",
    "npm run demo:judge -- --output tmp/demo-judge/JUDGE_REVIEW_20260429.md",
    "npm run demo:submission -- --output tmp/demo-submission/SUBMISSION_PACK_20260429.md"
  ];
}

function buildNextActions({ status }) {
  if (status === "needs_regeneration") {
    return [
      "Regenerate missing machine evidence packs.",
      "Rerun the submission pack after readiness and judge packs are current."
    ];
  }

  if (status === "ready_for_submission_review") {
    return [
      "Review every capture for accidental secrets or private contact data.",
      "Use the Judge Review Pack as the first reviewer-facing entry point.",
      "Keep raw media outside Git unless intentionally scrubbed and published."
    ];
  }

  return [
    "Record the happy-path walkthrough and update the capture manifest.",
    "Record or screenshot the failure-path appendix and update the capture manifest.",
    "Capture Open Platform permission and callback configuration screenshots with secrets hidden.",
    "Rerun `npm run demo:submission` with `--capture-manifest` after manual evidence is collected."
  ];
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
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
    captureManifest: typeof args["capture-manifest"] === "string" ? args["capture-manifest"] : "",
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-submission/SUBMISSION_PACK.md"),
    sourceOverrides: {
      readiness: typeof args.readiness === "string" ? args.readiness : undefined,
      judge: typeof args.judge === "string" ? args.judge : undefined,
      callback: typeof args.callback === "string" ? args.callback : undefined,
      capture: typeof args.capture === "string" ? args.capture : undefined,
      permissions: typeof args.permissions === "string" ? args.permissions : undefined,
      failure: typeof args.failure === "string" ? args.failure : undefined
    }
  };
}

function buildUsage() {
  return `Usage:
  npm run demo:submission
  npm run demo:submission -- --capture-manifest tmp/demo-submission/capture-manifest.json --output tmp/demo-submission/SUBMISSION_PACK.md

Options:
  --capture-manifest <path>  Optional JSON manifest for manual recordings and screenshots.
  --readiness <path>         Demo Readiness Pack markdown.
  --judge <path>             Judge Review Pack markdown.
  --callback <path>          Callback Verification Pack markdown.
  --capture <path>           Demo Capture Pack markdown.
  --permissions <path>       Permission Appendix Pack markdown.
  --failure <path>           Failure-Path Demo Pack markdown.
  --output <path>            Submission markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
