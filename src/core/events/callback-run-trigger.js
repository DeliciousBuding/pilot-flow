import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { JsonlRecorder } from "../recorder/jsonl-recorder.js";
import { RunOrchestrator } from "../orchestrator/run-orchestrator.js";

export async function triggerRunFromCallback(callback, {
  inputPath,
  outputPath,
  profile,
  feishuTargets,
  dryRun = false,
  recorder
} = {}) {
  const triggerRunId = `callback-trigger-${randomUUID()}`;

  const logRecorder = recorder || new JsonlRecorder(outputPath || "tmp/runs/card-callback-runs.jsonl");
  await logRecorder.record({
    run_id: triggerRunId,
    event: "card.callback_received",
    callback: {
      ok: callback.ok,
      card: callback.card,
      action: callback.action,
      original_run_id: callback.run_id,
      user_id: callback.user_id,
      decision: callback.decision
    }
  });

  if (dryRun) {
    await logRecorder.record({
      run_id: triggerRunId,
      event: "card.callback_triggered",
      status: "dry_run_skipped",
      reason: "dry-run mode"
    });
    return { triggerRunId, status: "dry_run_skipped", callback };
  }

  const runLogPath = outputPath || `tmp/runs/callback-run-${Date.now()}.jsonl`;
  await logRecorder.record({
    run_id: triggerRunId,
    event: "card.callback_triggered",
    status: "started",
    triggered_run_config: { inputPath, runLogPath }
  });

  try {
    const inputText = await readFile(inputPath || "src/demo/fixtures/demo_input_project_init.txt", "utf8");
    const runRecorder = new JsonlRecorder(runLogPath);

    const orchestrator = new RunOrchestrator({
      recorder: runRecorder,
      dryRun: false,
      mode: "live",
      profile: profile || "pilotflow-contest",
      feishuTargets: feishuTargets || {},
      duplicateGuard: { enabled: false }
    });

    const result = await orchestrator.startProjectInit(inputText, {
      autoConfirm: true,
      confirmationText: "确认起飞 (card callback)",
      sendEntryMessage: true,
      pinEntryMessage: true,
      updateAnnouncement: true,
      sendRiskCard: true
    });

    await logRecorder.record({
      run_id: triggerRunId,
      event: "card.callback_completed",
      status: result.status,
      triggered_run_id: result.runId,
      artifact_count: result.artifacts?.length || 0
    });

    return { triggerRunId, status: "completed", result, callback };
  } catch (error) {
    await logRecorder.record({
      run_id: triggerRunId,
      event: "card.callback_failed",
      error: { message: error.message }
    });
    return { triggerRunId, status: "failed", error: error.message, callback };
  }
}
