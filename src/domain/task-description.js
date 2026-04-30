export function buildTaskDescription({ runId, plan, taskAssignee }) {
  const lines = [
    `Created by PilotFlow run ${runId}.`,
    "",
    `Goal: ${plan.goal}`,
    `Fallback owner: ${taskAssignee.owner}`
  ];

  if (taskAssignee.assignee) {
    lines.push(`Feishu assignee: ${taskAssignee.assignee} (${taskAssignee.source})`);
  } else {
    lines.push(`Feishu assignee: ${taskAssignee.source}; using text owner fallback.`);
  }

  return lines.join("\n");
}
