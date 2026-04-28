import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { JsonlRecorder } from "../core/recorder/jsonl-recorder.js";
import { RunOrchestrator } from "../core/orchestrator/run-orchestrator.js";

const inputPath = resolve("src/demo/fixtures/demo_input_project_init.txt");
const outputPath = resolve("tmp/runs/latest-manual-run.jsonl");

const inputText = await readFile(inputPath, "utf8");
const recorder = new JsonlRecorder(outputPath);
const orchestrator = new RunOrchestrator({ recorder, dryRun: true });
const result = await orchestrator.startProjectInit(inputText, { autoConfirm: true });

console.log(JSON.stringify({ ...result, run_log: outputPath }, null, 2));
