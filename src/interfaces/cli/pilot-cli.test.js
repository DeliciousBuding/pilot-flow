import assert from "node:assert/strict";
import { buildStepArgs, COMMANDS } from "./pilot-cli.js";

const packageCommand = COMMANDS.package;
const liveCheckCommand = COMMANDS["live-check"];
const callbackProofCommand = COMMANDS["callback-proof"];

assert.equal(liveCheckCommand.description.includes("live"), true);
assert.equal(callbackProofCommand.description.includes("callback"), true);
assert.deepEqual(
  buildStepArgs({ command: liveCheckCommand, stepIndex: 0, passthroughArgs: ["--json"] }),
  ["--", "--json"]
);
assert.deepEqual(
  buildStepArgs({ command: callbackProofCommand, stepIndex: 0, passthroughArgs: ["--timeout", "60s"] }),
  ["--", "--timeout", "60s"]
);

assert.deepEqual(
  buildStepArgs({ command: packageCommand, stepIndex: 0, passthroughArgs: ["--input", "tmp/runs/custom.jsonl"] }),
  ["--", "--output", "tmp/demo-readiness/DEMO_READINESS.md"]
);

assert.deepEqual(
  buildStepArgs({ command: packageCommand, stepIndex: 3, passthroughArgs: ["--input", "tmp/runs/custom.jsonl"] }),
  ["--", "--output", "tmp/run-retrospective/RUN_RETROSPECTIVE.md", "--input", "tmp/runs/custom.jsonl"]
);

assert.deepEqual(
  buildStepArgs({ command: packageCommand, stepIndex: 4, passthroughArgs: ["--input=tmp/runs/custom.jsonl"] }),
  ["--", "--output", "tmp/retrospective-eval/RETROSPECTIVE_EVAL.md", "--input=tmp/runs/custom.jsonl"]
);

console.log("pilot cli tests passed");
