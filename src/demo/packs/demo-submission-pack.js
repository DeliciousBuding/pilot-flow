import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
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

  if (config.writeCaptureTemplate) {
    const template = buildCaptureManifestTemplate();
    await mkdir(dirname(config.writeCaptureTemplate), { recursive: true });
    await writeFile(config.writeCaptureTemplate, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        capture_template: config.writeCaptureTemplate || "",
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
    "| Capture | Status | Type | Redacted | File | SHA-256 | Review | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...pack.manualCaptures.map((item) => `| ${item.label} | ${item.ready ? "Ready" : item.status} | ${item.type || "unknown"} | ${item.redacted ? "yes" : "no"} | ${formatFileCell(item)} | ${item.sha256 ? `\`${item.sha256}\`` : "not available"} | ${formatReviewCell(item)} | ${escapeCell(item.notes)} |`),
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

export function buildCaptureManifestTemplate() {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    instructions: [
      "Keep this manifest under ignored tmp/ or outside the repository.",
      "Set status to ready only after the file exists and has been reviewed.",
      "Set redacted to true only after secrets, request URLs, tokens, and private contact details are hidden."
    ],
    captures: DEFAULT_MANUAL_CAPTURES.map((item) => ({
      label: item.label,
      type: item.type,
      required: item.required,
      status: "pending",
      path: "",
      redacted: false,
      reviewed_at: "",
      reviewer: "",
      notes: item.notes
    }))
  };
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
      const file = item.path ? await inspectCaptureFile(item.path) : { exists: false, sizeBytes: 0, sha256: "" };
      const ready = item.status === "ready" && file.exists && item.redacted;
      return {
        ...item,
        exists: file.exists,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        ready,
        missingReason: getManualCaptureMissingReason({ ...item, exists: file.exists, ready }),
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

async function inspectCaptureFile(filePath) {
  try {
    await access(filePath, constants.R_OK);
    const [stats, sha256] = await Promise.all([stat(filePath), hashFile(filePath)]);
    return {
      exists: true,
      sizeBytes: stats.size,
      sha256
    };
  } catch {
    return {
      exists: false,
      sizeBytes: 0,
      sha256: ""
    };
  }
}

function hashFile(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function getManualCaptureMissingReason(item) {
  if (item.ready) return "";
  if (item.status !== "ready") return "status is not ready";
  if (!item.path) return "path is missing";
  if (!item.exists) return "file does not exist";
  if (!item.redacted) return "redacted is not true";
  return "not ready";
}

function formatFileCell(item) {
  if (!item.path) return item.missingReason || "not provided";
  const detail = item.exists ? `${item.sizeBytes} bytes` : item.missingReason || "missing";
  return escapeCell(`\`${item.path}\`<br>${detail}`);
}

function formatReviewCell(item) {
  const reviewer = item.reviewer ? `reviewer: ${item.reviewer}` : "";
  const reviewedAt = item.reviewed_at ? `at: ${item.reviewed_at}` : "";
  return escapeCell([reviewer, reviewedAt].filter(Boolean).join("<br>") || "not recorded");
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
    writeCaptureTemplate: typeof args["write-capture-template"] === "string" ? resolve(args["write-capture-template"]) : "",
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
  npm run demo:submission -- --write-capture-template tmp/demo-submission/capture-manifest.template.json
  npm run demo:submission -- --capture-manifest tmp/demo-submission/capture-manifest.json --output tmp/demo-submission/SUBMISSION_PACK.md

Options:
  --capture-manifest <path>  Optional JSON manifest for manual recordings and screenshots.
  --write-capture-template <path>
                             Write a JSON capture manifest template while generating the pack.
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
