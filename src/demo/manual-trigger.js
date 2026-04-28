import { readFile } from "node:fs/promises";
import { JsonlRecorder } from "../core/recorder/jsonl-recorder.js";
import { RunOrchestrator } from "../core/orchestrator/run-orchestrator.js";
import { loadRuntimeConfig } from "../config/runtime-config.js";

const config = loadRuntimeConfig();

if (config.help) {
  console.log(config.usage);
  process.exit(0);
}

const inputText = await readFile(config.inputPath, "utf8");
const recorder = new JsonlRecorder(config.outputPath);
const orchestrator = new RunOrchestrator({
  recorder,
  dryRun: config.dryRun,
  mode: config.mode,
  profile: config.profile,
  feishuTargets: config.feishu
});
try {
  const result = await orchestrator.startProjectInit(inputText, {
    autoConfirm: config.confirmation.autoConfirm,
    confirmationText: config.confirmation.text,
    sendPlanCard: config.planCard.send
  });

  console.log(JSON.stringify({ ...result, mode: config.mode, run_log: config.outputPath }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        mode: config.mode,
        run_log: config.outputPath,
        error: error.message
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
