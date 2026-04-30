import { normalizeFeishuArtifacts } from "../tools/feishu/artifact-normalizer.js";

export class ToolStepRunner {
  constructor({ recorder, tools }) {
    this.recorder = recorder;
    this.tools = tools;
  }

  async callOptionalTool(runId, sequence, stepId, tool, input) {
    try {
      return await this.callTool(runId, sequence, stepId, tool, input);
    } catch (error) {
      const failedArtifact = {
        id: `artifact-${runId}-${tool.replaceAll(".", "-")}`,
        type: tool === "announcement.update" ? "announcement" : "message",
        title: input.title || tool,
        status: "failed",
        error: error.message
      };
      await this.recorder.record({
        run_id: runId,
        event: "artifact.failed",
        tool_call_id: `tool-${sequence}`,
        artifact: failedArtifact
      });
      await this.recorder.record({
        run_id: runId,
        event: "optional_tool.fallback",
        tool,
        fallback: "continue_with_existing_project_entry_path",
        error: { message: error.message }
      });
      return [failedArtifact];
    }
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
}
