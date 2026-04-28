export function buildDeliverySummaryText({ runId, plan, artifacts = [] }) {
  const lines = [
    "PilotFlow 已完成项目起飞。",
    "",
    `Run ID: ${runId}`,
    `目标: ${plan.goal}`,
    "",
    "已生成产物:"
  ];

  const doc = firstArtifact(artifacts, "doc");
  if (doc) {
    lines.push(`- Doc: ${formatArtifactTarget(doc)}`);
  }

  const baseRecords = artifacts.filter((artifact) => artifact.type === "base_record");
  if (baseRecords.length > 0) {
    lines.push(`- Base records: ${baseRecords.length} 条 (${formatRecordIds(baseRecords)})`);
  }

  const task = firstArtifact(artifacts, "task");
  if (task) {
    lines.push(`- Task: ${formatArtifactTarget(task)}`);
  }

  lines.push("", "下一步: 请在群内确认负责人、截止时间和风险处理方式。");

  return lines.join("\n");
}

function firstArtifact(artifacts, type) {
  return artifacts.find((artifact) => artifact.type === type);
}

function formatArtifactTarget(artifact) {
  if (artifact.url) return `${artifact.title} - ${artifact.url}`;
  if (artifact.external_id) return `${artifact.title} (${artifact.external_id})`;
  return artifact.title;
}

function formatRecordIds(records) {
  const ids = records.map((record) => record.external_id).filter(Boolean);
  if (ids.length === 0) return "planned";

  const visible = ids.slice(0, 3).join(", ");
  if (ids.length <= 3) return visible;
  return `${visible}, ...`;
}
