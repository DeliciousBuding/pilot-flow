import { randomUUID } from "node:crypto";
import { createProjectInitPlan } from "../planner/project-init-planner.js";
import { FeishuToolExecutor } from "../../tools/feishu/feishu-tool-executor.js";
import { normalizeFeishuArtifacts } from "../../tools/feishu/artifact-normalizer.js";
import { buildDeliverySummaryText } from "./summary-builder.js";
import { buildFlightPlanCard } from "./flight-plan-card.js";
import { buildProjectEntryMessageText } from "./entry-message-builder.js";
import { buildProjectInitDedupeKey, duplicateGuardSummary, DuplicateRunGuard } from "./duplicate-run-guard.js";
import {
  buildProjectStateRows,
  firstTaskFallbackOwner,
  firstTaskSummary,
  normalizeDueDate,
  PROJECT_STATE_FIELDS
} from "./project-state-builder.js";

const SIDE_EFFECT_TOOLS = ["doc.create", "base.write", "task.create", "im.send"];

export class RunOrchestrator {
  constructor({ recorder, dryRun = true, mode = "dry-run", profile, feishuTargets = {}, duplicateGuard = {} } = {}) {
    this.recorder = recorder;
    this.mode = mode;
    this.profile = profile;
    this.feishuTargets = feishuTargets;
    this.tools = new FeishuToolExecutor({ dryRun, profile, targets: feishuTargets });
    this.duplicateGuard = new DuplicateRunGuard(duplicateGuard);
  }

  async startProjectInit(
    inputText,
    { autoConfirm = true, confirmationText = "", sendPlanCard = false, sendEntryMessage = false, dedupeKey = "" } = {}
  ) {
    const runId = `run-${randomUUID()}`;
    await this.recorder.record({ run_id: runId, event: "run.created", intent: "project_init", mode: this.mode });

    const plan = createProjectInitPlan(inputText);
    await this.recorder.record({ run_id: runId, event: "plan.generated", plan });

    await this.recorder.record({
      run_id: runId,
      event: "confirmation.requested",
      confirmation: plan.confirmations[0]
    });

    const artifacts = [];
    const plannedTools = plannedToolsForRun({ autoConfirm, sendPlanCard, sendEntryMessage });
    if (plannedTools.length > 0) {
      try {
        this.tools.preflight(plannedTools);
      } catch (error) {
        await this.recorder.record({
          run_id: runId,
          event: "run.failed",
          error: { message: error.message },
          failed_before_side_effects: true
        });
        throw error;
      }
    }

    const guardKey = buildProjectInitDedupeKey({
      inputText,
      plan,
      profile: this.profile,
      targets: this.feishuTargets,
      explicitKey: dedupeKey
    });
    const guardState = await this.startDuplicateGuard(runId, guardKey, plan, shouldGuardRun({ autoConfirm, sendPlanCard }));

    if (sendPlanCard) {
      try {
        artifacts.push(
          ...(await this.callTool(runId, 0, "step-confirm", "card.send", {
            title: "PilotFlow 项目飞行计划",
            card: buildFlightPlanCard({ runId, plan, confirmationText: "确认起飞" })
          }))
        );
      } catch (error) {
        await this.recorder.record({
          run_id: runId,
          event: "run.failed",
          error: { message: error.message },
          failed_before_side_effects: true
        });
        throw error;
      }
    }

    if (!autoConfirm) {
      await this.recorder.record({
        run_id: runId,
        event: "run.waiting_confirmation",
        expected_confirmation_text: "确认起飞",
        received_confirmation_text: confirmationText || null
      });
      return { runId, status: "waiting_confirmation", plan, artifacts, duplicate_guard: guardState };
    }

    const approved = {
      ...plan.confirmations[0],
      status: "approved",
      approved_by: "demo-user",
      approved_at: new Date().toISOString(),
      confirmation_text: confirmationText || "auto-confirmed dry-run"
    };
    await this.recorder.record({ run_id: runId, event: "confirmation.approved", confirmation: approved });

    try {
      artifacts.push(
        ...(await this.callTool(runId, 1, "step-doc", "doc.create", {
          title: "PilotFlow Project Brief",
          markdown: buildBriefMarkdown(plan)
        }))
      );

      artifacts.push(
        ...(await this.callTool(runId, 2, "step-state", "base.write", {
          body: {
            fields: PROJECT_STATE_FIELDS,
            rows: buildProjectStateRows(plan, { runId, artifacts })
          }
        }))
      );

      artifacts.push(
        ...(await this.callTool(runId, 3, "step-task", "task.create", {
          summary: firstTaskSummary(plan),
          description: `Created by PilotFlow run ${runId}.\n\nGoal: ${plan.goal}\nFallback owner: ${firstTaskFallbackOwner(plan)}`,
          due: normalizeDueDate(plan.deadline)
        }))
      );

      if (sendEntryMessage) {
        const entryMessageText = buildProjectEntryMessageText({ runId, plan, artifacts });
        artifacts.push(
          ...(await this.callTool(runId, 4, "step-entry", "entry.send", {
            text: entryMessageText
          }))
        );
      } else {
        await this.skipStep(runId, "step-entry", "entry message disabled");
      }

      const summaryText = buildDeliverySummaryText({ runId, plan, artifacts });
      artifacts.push(
        ...(await this.callTool(runId, 5, "step-summary", "im.send", {
          text: summaryText
        }))
      );
    } catch (error) {
      await this.duplicateGuard.mark({ key: guardState.key, runId, status: "failed", artifacts });
      await this.recorder.record({ run_id: runId, event: "run.failed", error: { message: error.message } });
      throw error;
    }

    const runLogArtifact = {
      id: `artifact-${runId}-log`,
      type: "run_log",
      title: "JSONL run log",
      status: "created"
    };
    artifacts.push(runLogArtifact);

    await this.recorder.record({
      run_id: runId,
      event: "artifact.created",
      artifact: runLogArtifact
    });
    await this.duplicateGuard.mark({ key: guardState.key, runId, status: "completed", artifacts });
    await this.recorder.record({ run_id: runId, event: "run.completed" });

    return { runId, status: "completed", plan, artifacts, duplicate_guard: guardState };
  }

  async callTool(runId, sequence, stepId, tool, input) {
    const toolCallId = `tool-${sequence}`;
    await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "running" });
    await this.recorder.record({ run_id: runId, event: "tool.called", tool_call_id: toolCallId, tool, input });
    try {
      const output = await this.tools.execute(tool, input, { runId, sequence });
      await this.recorder.record({ run_id: runId, event: "tool.succeeded", tool_call_id: toolCallId, tool, output });
      const artifacts = normalizeFeishuArtifacts(tool, input, output, { runId, sequence });
      for (const artifact of artifacts) {
        await this.recorder.record({
          run_id: runId,
          event: artifact.status === "planned" ? "artifact.planned" : "artifact.created",
          tool_call_id: toolCallId,
          artifact
        });
      }
      await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "succeeded" });
      return artifacts;
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "tool.failed",
        tool_call_id: toolCallId,
        tool,
        error: {
          message: error.message,
          result: error.result
        }
      });
      await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "failed" });
      throw error;
    }
  }

  async skipStep(runId, stepId, reason) {
    await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "skipped", reason });
  }

  async startDuplicateGuard(runId, key, plan, enabledForRun) {
    if (!enabledForRun) {
      const state = { enabled: false, key, status: "skipped", reason: "no_live_side_effects" };
      await this.recorder.record({ run_id: runId, event: "run.guard_skipped", duplicate_guard: state });
      return state;
    }

    try {
      const state = await this.duplicateGuard.start({
        key,
        runId,
        summary: duplicateGuardSummary({ plan, mode: this.mode, profile: this.profile })
      });
      await this.recorder.record({ run_id: runId, event: "run.guard_checked", duplicate_guard: state });
      return state;
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "run.duplicate_blocked",
        duplicate_guard: {
          enabled: true,
          key,
          status: "blocked",
          existing_run: error.existingRun
        }
      });
      await this.recorder.record({
        run_id: runId,
        event: "run.failed",
        error: { message: error.message, code: error.code },
        failed_before_side_effects: true
      });
      throw error;
    }
  }
}

function toolsForRun(sendEntryMessage) {
  return sendEntryMessage ? [...SIDE_EFFECT_TOOLS, "entry.send"] : SIDE_EFFECT_TOOLS;
}

function plannedToolsForRun({ autoConfirm, sendPlanCard, sendEntryMessage }) {
  return [...(sendPlanCard ? ["card.send"] : []), ...(autoConfirm ? toolsForRun(sendEntryMessage) : [])];
}

function shouldGuardRun({ autoConfirm, sendPlanCard }) {
  return autoConfirm || sendPlanCard;
}

function buildBriefMarkdown(plan) {
  return `# PilotFlow Project Brief

## Goal

${plan.goal}

## Members

${plan.members.map((member) => `- ${member}`).join("\n") || "- TBD"}

## Deliverables

${plan.deliverables.map((item) => `- ${item}`).join("\n") || "- TBD"}

## Deadline

${plan.deadline}

## Risks

${plan.risks.map((risk) => `- ${risk.title}`).join("\n") || "- No explicit risks"}
`;
}
