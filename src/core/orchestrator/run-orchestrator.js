import { randomUUID } from "node:crypto";
import { createProjectInitPlan } from "../planner/project-init-planner.js";
import { FeishuToolExecutor } from "../../tools/feishu/feishu-tool-executor.js";
import { normalizeFeishuArtifacts } from "../../tools/feishu/artifact-normalizer.js";
import { buildDeliverySummaryText } from "./summary-builder.js";
import { buildFlightPlanCard } from "./flight-plan-card.js";

const SIDE_EFFECT_TOOLS = ["doc.create", "base.write", "task.create", "im.send"];

export class RunOrchestrator {
  constructor({ recorder, dryRun = true, mode = "dry-run", profile, feishuTargets = {} } = {}) {
    this.recorder = recorder;
    this.mode = mode;
    this.tools = new FeishuToolExecutor({ dryRun, profile, targets: feishuTargets });
  }

  async startProjectInit(inputText, { autoConfirm = true, confirmationText = "", sendPlanCard = false } = {}) {
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

    if (sendPlanCard) {
      try {
        this.tools.preflight(autoConfirm ? ["card.send", ...SIDE_EFFECT_TOOLS] : ["card.send"]);
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
      return { runId, status: "waiting_confirmation", plan, artifacts };
    }

    try {
      this.tools.preflight(SIDE_EFFECT_TOOLS);
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "run.failed",
        error: { message: error.message },
        failed_before_side_effects: true
      });
      throw error;
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
            fields: ["type", "title", "status", "source_run"],
            rows: buildStateRows(plan, runId)
          }
        }))
      );

      artifacts.push(
        ...(await this.callTool(runId, 3, "step-task", "task.create", {
          summary: firstTaskSummary(plan),
          description: `Created by PilotFlow run ${runId}.\n\nGoal: ${plan.goal}`,
          due: normalizeDueDate(plan.deadline)
        }))
      );

      const summaryText = buildDeliverySummaryText({ runId, plan, artifacts });
      artifacts.push(
        ...(await this.callTool(runId, 4, "step-summary", "im.send", {
          text: summaryText
        }))
      );
    } catch (error) {
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
    await this.recorder.record({ run_id: runId, event: "run.completed" });

    return { runId, status: "completed", plan, artifacts };
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

function buildStateRows(plan, runId) {
  const taskRows = plan.deliverables.map((item) => ["task", item, "todo", runId]);
  const riskRows = plan.risks.map((risk) => ["risk", risk.title, "open", runId]);
  return [...taskRows, ...riskRows, ["artifact", "Project brief document", "planned", runId]];
}

function firstTaskSummary(plan) {
  return plan.deliverables[0] || `Kick off: ${plan.goal}`;
}

function normalizeDueDate(deadline) {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : undefined;
}
