import { randomUUID } from "node:crypto";
import { createProjectInitPlan } from "../planner/project-init-planner.js";
import { FeishuToolExecutor } from "../../tools/feishu/feishu-tool-executor.js";

export class RunOrchestrator {
  constructor({ recorder, dryRun = true } = {}) {
    this.recorder = recorder;
    this.tools = new FeishuToolExecutor({ dryRun });
  }

  async startProjectInit(inputText, { autoConfirm = true } = {}) {
    const runId = `run-${randomUUID()}`;
    await this.recorder.record({ run_id: runId, event: "run.created", intent: "project_init" });

    const plan = createProjectInitPlan(inputText);
    await this.recorder.record({ run_id: runId, event: "plan.generated", plan });

    await this.recorder.record({
      run_id: runId,
      event: "confirmation.requested",
      confirmation: plan.confirmations[0]
    });

    if (!autoConfirm) {
      await this.recorder.record({ run_id: runId, event: "run.waiting_confirmation" });
      return { runId, status: "waiting_confirmation", plan };
    }

    const approved = {
      ...plan.confirmations[0],
      status: "approved",
      approved_by: "demo-user",
      approved_at: new Date().toISOString()
    };
    await this.recorder.record({ run_id: runId, event: "confirmation.approved", confirmation: approved });

    await this.callTool(runId, 1, "doc.create", {
      title: "PilotFlow Project Brief",
      markdown: buildBriefMarkdown(plan)
    });

    await this.callTool(runId, 2, "base.write", {
      body: {
        fields: ["type", "title", "status", "source_run"],
        rows: [["task", "Create project brief", "todo", runId]]
      }
    });

    await this.callTool(runId, 3, "im.send", {
      text: `PilotFlow run ${runId} completed. Brief, state records, and summary are ready for review.`
    });

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

  async callTool(runId, sequence, tool, input) {
    const toolCallId = `tool-${sequence}`;
    await this.recorder.record({ run_id: runId, event: "tool.called", tool_call_id: toolCallId, tool, input });
    try {
      const output = await this.tools.execute(tool, input, { runId, sequence });
      await this.recorder.record({ run_id: runId, event: "tool.succeeded", tool_call_id: toolCallId, tool, output });
      return output;
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "tool.failed",
        tool_call_id: toolCallId,
        tool,
        error: { message: error.message }
      });
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
