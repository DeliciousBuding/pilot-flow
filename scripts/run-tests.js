import { spawn } from "node:child_process";
import { relative } from "node:path";

const TEST_GROUPS = {
  core: [
    "src/config/runtime-config.test.js",
    "src/core/planner/plan-validator.test.js",
    "src/core/orchestrator/run-orchestrator.test.js",
    "src/core/orchestrator/card-callback-handler.test.js",
    "src/core/orchestrator/contact-owner-resolver.test.js",
    "src/core/orchestrator/duplicate-run-guard.test.js",
    "src/core/orchestrator/entry-message-builder.test.js",
    "src/core/orchestrator/flight-plan-card.test.js",
    "src/core/orchestrator/project-state-builder.test.js",
    "src/core/orchestrator/risk-decision-card.test.js",
    "src/core/orchestrator/risk-detector.test.js",
    "src/core/orchestrator/summary-builder.test.js",
    "src/core/orchestrator/task-assignee-resolver.test.js",
    "src/core/events/card-event-listener.test.js",
    "src/core/events/callback-run-trigger.test.js",
    "src/tools/feishu/artifact-normalizer.test.js",
    "src/tools/feishu/feishu-tool-executor.test.js"
  ],
  demo: ["src/demo/flight-recorder-view.test.js"],
  packs: [
    "src/demo/packs/demo-evidence.test.js",
    "src/demo/packs/demo-eval.test.js",
    "src/demo/packs/demo-capture-pack.test.js",
    "src/demo/packs/demo-failure-pack.test.js",
    "src/demo/packs/demo-readiness-pack.test.js",
    "src/demo/packs/demo-permission-pack.test.js",
    "src/demo/packs/demo-callback-verification-pack.test.js",
    "src/demo/packs/demo-judge-pack.test.js",
    "src/demo/packs/demo-submission-pack.test.js",
    "src/demo/packs/demo-delivery-index-pack.test.js",
    "src/demo/packs/demo-safety-audit-pack.test.js"
  ]
};

const TEST_ALIASES = {
  artifacts: "src/tools/feishu/artifact-normalizer.test.js",
  "feishu-tools": "src/tools/feishu/feishu-tool-executor.test.js",
  plan: "src/core/planner/plan-validator.test.js",
  orchestrator: "src/core/orchestrator/run-orchestrator.test.js",
  callback: "src/core/orchestrator/card-callback-handler.test.js",
  card: "src/core/orchestrator/flight-plan-card.test.js",
  guard: "src/core/orchestrator/duplicate-run-guard.test.js",
  entry: "src/core/orchestrator/entry-message-builder.test.js",
  flight: "src/demo/flight-recorder-view.test.js",
  evidence: "src/demo/packs/demo-evidence.test.js",
  eval: "src/demo/packs/demo-eval.test.js",
  capture: "src/demo/packs/demo-capture-pack.test.js",
  failure: "src/demo/packs/demo-failure-pack.test.js",
  readiness: "src/demo/packs/demo-readiness-pack.test.js",
  permissions: "src/demo/packs/demo-permission-pack.test.js",
  judge: "src/demo/packs/demo-judge-pack.test.js",
  "callback-pack": "src/demo/packs/demo-callback-verification-pack.test.js",
  submission: "src/demo/packs/demo-submission-pack.test.js",
  "delivery-index": "src/demo/packs/demo-delivery-index-pack.test.js",
  "safety-audit": "src/demo/packs/demo-safety-audit-pack.test.js",
  risk: ["src/core/orchestrator/risk-detector.test.js", "src/core/orchestrator/risk-decision-card.test.js"],
  state: "src/core/orchestrator/project-state-builder.test.js",
  summary: "src/core/orchestrator/summary-builder.test.js",
  contact: "src/core/orchestrator/contact-owner-resolver.test.js",
  assignee: "src/core/orchestrator/task-assignee-resolver.test.js",
  config: "src/config/runtime-config.test.js",
  listener: "src/core/events/card-event-listener.test.js",
  trigger: "src/core/events/callback-run-trigger.test.js"
};

function unique(items) {
  return [...new Set(items)];
}

function toArray(value) {
  return Array.isArray(value) ? value : [value];
}

function resolveTestFiles(selectors) {
  const requestedSelectors = selectors.length > 0 ? selectors : ["all"];
  if (requestedSelectors.includes("all")) {
    return unique(Object.values(TEST_GROUPS).flat());
  }

  const files = [];
  for (const selector of requestedSelectors) {
    if (TEST_GROUPS[selector]) {
      files.push(...TEST_GROUPS[selector]);
      continue;
    }

    if (TEST_ALIASES[selector]) {
      files.push(...toArray(TEST_ALIASES[selector]));
      continue;
    }

    if (selector.endsWith(".js")) {
      files.push(selector);
      continue;
    }

    throw new Error(`Unknown test selector: ${selector}`);
  }

  return unique(files);
}

function runTest(file) {
  return new Promise((resolve, reject) => {
    console.log(`\n> node ${file}`);
    const child = spawn(process.execPath, [file], {
      stdio: "inherit",
      shell: false
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Test failed: ${relative(process.cwd(), file)}`));
    });
  });
}

function renderHelp() {
  const groups = Object.keys(TEST_GROUPS).join(", ");
  const aliases = Object.keys(TEST_ALIASES).join(", ");
  return [
    "Usage:",
    "  node scripts/run-tests.js [all|group|alias|file...]",
    "",
    `Groups: all, ${groups}`,
    `Aliases: ${aliases}`,
    "",
    "Examples:",
    "  npm test",
    "  npm run test:core",
    "  npm run test:packs",
    "  npm run test:one -- plan",
    "  npm run test:one -- risk"
  ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(renderHelp());
    return;
  }

  const files = resolveTestFiles(argv);
  for (const file of files) {
    await runTest(file);
  }

  console.log(`\nPassed ${files.length} test files.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
