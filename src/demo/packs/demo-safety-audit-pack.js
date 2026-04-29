import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SCAN_TARGETS = [
  {
    key: "readme",
    label: "Repository README",
    path: "README.md",
    kind: "file",
    group: "public_surface",
    required: true
  },
  {
    key: "package",
    label: "Package manifest",
    path: "package.json",
    kind: "file",
    group: "public_surface",
    required: true
  },
  {
    key: "docs",
    label: "Public docs",
    path: "docs",
    kind: "directory",
    group: "public_surface",
    required: true
  },
  {
    key: "src",
    label: "Source files",
    path: "src",
    kind: "directory",
    group: "public_surface",
    required: true
  },
  {
    key: "readiness",
    label: "Demo Readiness Pack",
    path: "tmp/demo-readiness/DEMO_READINESS_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "judge",
    label: "Judge Review Pack",
    path: "tmp/demo-judge/JUDGE_REVIEW_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "submission",
    label: "Demo Submission Pack",
    path: "tmp/demo-submission/SUBMISSION_PACK_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "deliveryIndex",
    label: "Demo Delivery Index",
    path: "tmp/demo-delivery/DELIVERY_INDEX_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "permissions",
    label: "Permission Appendix Pack",
    path: "tmp/demo-permissions/PERMISSION_APPENDIX_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "callback",
    label: "Callback Verification Pack",
    path: "tmp/demo-callback/CALLBACK_VERIFICATION_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "capture",
    label: "Demo Capture Pack",
    path: "tmp/demo-capture/CAPTURE_PACK_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "failure",
    label: "Failure-Path Demo Pack",
    path: "tmp/demo-failure/FAILURE_DEMO_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "evidence",
    label: "Demo Evidence Pack",
    path: "tmp/demo-evidence/DEMO_EVIDENCE_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "evaluation",
    label: "Demo Evaluation Pack",
    path: "tmp/demo-eval/DEMO_EVAL_20260429.md",
    kind: "file",
    group: "generated_review_material",
    required: false
  },
  {
    key: "flightRecorder",
    label: "Flight Recorder HTML",
    path: "tmp/flight-recorder/announcement-upgrade-live-20260429-fixed.html",
    kind: "file",
    group: "generated_review_material",
    required: false
  }
];

const SCAN_EXTENSIONS = new Set([".html", ".js", ".json", ".md", ".mjs", ".txt"]);

const SECRET_PATTERNS = [
  {
    id: "openai_compatible_api_key",
    severity: "high",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    hint: "Remove API keys from public docs and generated review material."
  },
  {
    id: "bearer_token",
    severity: "high",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
    hint: "Remove Authorization headers or replace them with a redacted placeholder."
  },
  {
    id: "named_secret_value",
    severity: "high",
    pattern: /\b(?:app_secret|client_secret|access_token|refresh_token|verification_token|encrypt_key|api_key)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,}/gi,
    hint: "Keep named secret values outside Git and screenshots."
  },
  {
    id: "feishu_user_open_id",
    severity: "medium",
    pattern: /\bou_[0-9a-f]{20,}\b/gi,
    hint: "Avoid publishing personal Feishu open_id values in public material."
  }
];

if (isMainModule()) {
  const config = parseArgs(process.argv.slice(2));

  if (config.help) {
    console.log(buildUsage());
    process.exit(0);
  }

  const pack = await buildDemoSafetyAuditPack(config);
  const markdown = renderDemoSafetyAuditMarkdown(pack);
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, markdown, "utf8");

  console.log(
    JSON.stringify(
      {
        status: "created",
        output: config.output,
        audit_status: pack.status,
        scanned_file_count: pack.summary.scannedFiles,
        finding_count: pack.summary.findings,
        missing_required_count: pack.summary.missingRequired
      },
      null,
      2
    )
  );
}

export async function buildDemoSafetyAuditPack({
  targetOverrides = {},
  output = "tmp/demo-safety/SAFETY_AUDIT.md"
} = {}) {
  const targets = await Promise.all(
    DEFAULT_SCAN_TARGETS.map(async (target) =>
      inspectTarget({
        ...target,
        path: resolve(targetOverrides[target.key] || target.path)
      })
    )
  );
  const files = targets.flatMap((target) => target.files.map((filePath) => ({ filePath, target })));
  const scanned = await Promise.all(files.map((item) => scanFile(item.filePath, item.target)));
  const findings = scanned.flatMap((item) => item.findings);
  const missingRequired = targets.filter((item) => item.required && !item.exists).length;
  const status = deriveStatus({ missingRequired, findings });

  return {
    generatedAt: new Date().toISOString(),
    output: resolve(output),
    status,
    summary: {
      targets: targets.length,
      existingTargets: targets.filter((item) => item.exists).length,
      scannedFiles: scanned.length,
      findings: findings.length,
      highFindings: findings.filter((item) => item.severity === "high").length,
      mediumFindings: findings.filter((item) => item.severity === "medium").length,
      missingRequired
    },
    targets: targets.map(({ files, ...target }) => ({ ...target, fileCount: files.length })),
    findings,
    recommendedCommands: buildRecommendedCommands(),
    nextActions: buildNextActions({ status, findings, missingRequired })
  };
}

export function renderDemoSafetyAuditMarkdown(pack) {
  const lines = [
    "# PilotFlow Demo Safety Audit Pack",
    "",
    `- Generated at: \`${pack.generatedAt}\``,
    `- Status: \`${pack.status}\``,
    `- Scanned files: ${pack.summary.scannedFiles}`,
    `- Findings: ${pack.summary.findings} (${pack.summary.highFindings} high, ${pack.summary.mediumFindings} medium)`,
    `- Missing required targets: ${pack.summary.missingRequired}`,
    "",
    "## Scope",
    "",
    "| Target | Group | Required | Status | Files | Path |",
    "| --- | --- | --- | --- | --- | --- |",
    ...pack.targets.map((item) => `| ${item.label} | ${item.group} | ${item.required ? "yes" : "no"} | ${item.exists ? "Ready" : "Missing"} | ${item.fileCount} | \`${item.path}\` |`),
    "",
    "## Findings",
    "",
    ...renderFindingLines(pack.findings),
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
    "- This audit is a pattern-based safety gate, not a formal security review.",
    "- It scans public docs, source files, and generated review material; it does not inspect raw videos or screenshots.",
    "- A clean result does not mean screenshots are safe. Human review is still required before publishing media.",
    "- Keep raw live logs and capture files outside Git unless scrubbed and intentionally published."
  ];

  return `${lines.join("\n")}\n`;
}

async function inspectTarget(target) {
  const exists = await canRead(target.path);
  if (!exists) return { ...target, exists: false, files: [] };

  const files = target.kind === "directory" ? await collectFiles(target.path) : [target.path];
  return {
    ...target,
    exists: true,
    files: files.filter((filePath) => SCAN_EXTENSIONS.has(extname(filePath).toLowerCase()))
  };
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        const fullPath = resolve(directory, entry.name);
        if (entry.isDirectory()) return collectFiles(fullPath);
        if (entry.isFile()) return [fullPath];
        return [];
      })
  );
  return nested.flat();
}

async function scanFile(filePath, target) {
  const text = await readFile(filePath, "utf8");
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (const rule of SECRET_PATTERNS) {
    for (const match of text.matchAll(rule.pattern)) {
      const location = locateMatch(text, match.index || 0, lines);
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        filePath,
        target: target.label,
        group: target.group,
        line: location.line,
        excerpt: redactExcerpt(location.text),
        hint: rule.hint
      });
    }
  }

  return { filePath, findings };
}

function deriveStatus({ missingRequired, findings }) {
  if (missingRequired > 0) return "missing_required_targets";
  if (findings.some((item) => item.severity === "high")) return "blocked_secret_findings";
  if (findings.length > 0) return "review_findings_present";
  return "passed";
}

function locateMatch(text, index, lines) {
  let offset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const nextOffset = offset + lines[lineIndex].length + 1;
    if (index < nextOffset) {
      return {
        line: lineIndex + 1,
        text: lines[lineIndex]
      };
    }
    offset = nextOffset;
  }
  return { line: lines.length, text: lines.at(-1) || "" };
}

function redactExcerpt(value) {
  const trimmed = String(value).trim();
  if (trimmed.length <= 20) return "[redacted]";
  return `${trimmed.slice(0, 12)}...[redacted]...${trimmed.slice(-8)}`;
}

function renderFindingLines(findings) {
  if (findings.length === 0) return ["No secret-like findings detected."];
  return [
    "| Severity | Rule | File | Line | Excerpt | Hint |",
    "| --- | --- | --- | --- | --- | --- |",
    ...findings.map((item) => `| ${item.severity} | ${item.rule} | \`${item.filePath}\` | ${item.line} | ${escapeCell(item.excerpt)} | ${escapeCell(item.hint)} |`)
  ];
}

function buildRecommendedCommands() {
  return [
    "npm run demo:delivery-index -- --output tmp/demo-delivery/DELIVERY_INDEX_20260429.md",
    "npm run demo:safety-audit -- --output tmp/demo-safety/SAFETY_AUDIT_20260429.md",
    "npm run demo:submission -- --output tmp/demo-submission/SUBMISSION_PACK_20260429.md"
  ];
}

function buildNextActions({ status, findings, missingRequired }) {
  if (missingRequired > 0) {
    return [
      "Regenerate or restore missing required public docs/source targets.",
      "Rerun the safety audit before review packaging."
    ];
  }

  if (findings.length > 0) {
    return [
      "Remove or redact every finding before publishing docs, screenshots, or generated review material.",
      "Rerun `npm run demo:safety-audit` and keep the clean report with the submission materials."
    ];
  }

  return [
    "Keep this clean audit report with the generated delivery index.",
    "Run the audit again after adding screenshots, recordings, or callback proof.",
    "Continue keeping raw media and unsanitized logs outside Git."
  ];
}

async function canRead(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
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
    output: resolve(typeof args.output === "string" ? args.output : "tmp/demo-safety/SAFETY_AUDIT.md"),
    targetOverrides: Object.fromEntries(
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
  npm run demo:safety-audit
  npm run demo:safety-audit -- --output tmp/demo-safety/SAFETY_AUDIT.md

Options:
  --readme <path>           README path.
  --package <path>          package.json path.
  --docs <path>             docs directory path.
  --src <path>              src directory path.
  --readiness <path>        Demo Readiness Pack path.
  --judge <path>            Judge Review Pack path.
  --submission <path>       Demo Submission Pack path.
  --delivery-index <path>   Demo Delivery Index path.
  --permissions <path>      Permission Appendix Pack path.
  --callback <path>         Callback Verification Pack path.
  --capture <path>          Demo Capture Pack path.
  --failure <path>          Failure-Path Demo Pack path.
  --evidence <path>         Demo Evidence Pack path.
  --evaluation <path>       Demo Evaluation Pack path.
  --flight-recorder <path>  Flight Recorder HTML path.
  --output <path>           Safety audit markdown output path.
`;
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}
