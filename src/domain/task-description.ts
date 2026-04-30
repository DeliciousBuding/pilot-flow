import type { Artifact } from "../types/artifact.js";
import type { ProjectInitPlan } from "../types/plan.js";

export interface TaskAssigneeContext {
  readonly owner: string;
  readonly assignee?: string;
  readonly source: string;
}

export interface BuildTaskDescriptionOptions {
  readonly runId: string;
  readonly plan: Pick<ProjectInitPlan, "goal">;
  readonly taskAssignee: TaskAssigneeContext;
  readonly artifacts?: readonly Artifact[];
}

export function buildTaskDescription({ runId, plan, taskAssignee, artifacts = [] }: BuildTaskDescriptionOptions): string {
  const lines = [
    `Created by PilotFlow run ${runId}.`,
    "",
    `Goal: ${plan.goal}`,
    `Fallback owner: ${taskAssignee.owner}`,
  ];

  if (taskAssignee.assignee) {
    lines.push(`Feishu assignee: ${taskAssignee.assignee} (${taskAssignee.source})`);
  } else {
    lines.push(`Feishu assignee: ${taskAssignee.source}; using text owner fallback.`);
  }

  if (artifacts.length > 0) {
    lines.push("", "Related artifacts:");
    for (const artifact of artifacts) {
      const label = artifact.title ?? artifact.external_id;
      lines.push(artifact.url ? `- ${artifact.type}: ${label} (${artifact.url})` : `- ${artifact.type}: ${label}`);
    }
  }

  return lines.join("\n");
}
