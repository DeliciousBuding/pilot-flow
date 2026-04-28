import { randomUUID } from "node:crypto";
import { createProjectInitPlan } from "../planner/project-init-planner.js";
import { FeishuToolExecutor } from "../../tools/feishu/feishu-tool-executor.js";

export class RunOrchestrator {
  constructor({ recorder, dryRun = true, mode = "dry-run", profile, feishuTargets = {} } = {}) {
    this.recorder = recorder;
    this.mode = mode;
    this.tools = new FeishuToolExecutor({ dryRun, profile, targets: feishuTargets });
  }

  async startProjectInit(inputText, { autoConfirm = true, confirmationText = "" } = {}) {
    const runId = `run-${randomUUID()}`;
    await this.recorder.record({ run_id: runId, event: "run.created", intent: "project_init", mode: this.mode });

    const plan = createProjectInitPlan(inputText);
    await this.recorder.record({ run_id: runId, event: "plan.generated", plan });

    await this.recorder.record({
      run_id: runId,
      event: "confirmation.requested",
      confirmation: plan.confirmations[0]
    });

    if (!autoConfirm) {
      await this.recorder.record({
        run_id: runId,
        event: "run.waiting_confirmation",
        expected_confirmation_text: "确认起飞",
        received_confirmation_text: confirmationText || null
      });
      return { runId, status: "waiting_confirmation", plan };
    }

    try {
      this.tools.preflight(["doc.create", "base.write", "task.create", "im.send"]);
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
      await this.callTool(runId, 1, "step-doc", "doc.create", {
        title: "PilotFlow Project Brief",
        markdown: buildBriefMarkdown(plan)
      });

      await this.callTool(runId, 2, "step-state", "base.write", {
        body: {
          fields: ["type", "title", "status", "source_run"],
          rows: buildStateRows(plan, runId)
        }
      });

      await this.callTool(runId, 3, "step-task", "task.create", {
        summary: firstTaskSummary(plan),
        description: `Created by PilotFlow run ${runId}.\n\nGoal: ${plan.goal}`,
        due: normalizeDueDate(plan.deadline)
      });

      await this.callTool(runId, 4, "step-summary", "im.send", {
        text: `PilotFlow run ${runId} completed. Brief, state records, and summary are ready for review.`
      });
    } catch (error) {
      await this.recorder.record({ run_id: runId, event: "run.failed", error: { message: error.message } });
      throw error;
    }

    await this.recorder.record({
      run_id: runId,
      event: "artifact.created",
      artifact: {
        id: `artifact-${runId}-log`,
        type: "run_log",
        title: "JSONL run log",
        status: "created"
      }
    });
    await this.recorder.record({ run_id: runId, event: "run.completed" });

    return { runId, status: "completed", plan };
  }

  async callTool(runId, sequence, stepId, tool, input) {
    const toolCallId = `tool-${sequence}`;
    await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "running" });
    await this.recorder.record({ run_id: runId, event: "tool.called", tool_call_id: toolCallId, tool, input });
    try {
      const output = await this.tools.execute(tool, input, { runId, sequence });
      await this.recorder.record({ run_id: runId, event: "tool.succeeded", tool_call_id: toolCallId, tool, output });
      await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "succeeded" });
      return output;
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
