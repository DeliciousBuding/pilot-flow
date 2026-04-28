export function buildProjectEntryMessageText({ runId, plan, artifacts = [] }) {
  const lines = [
    "PilotFlow 项目入口已就绪。",
    "",
    `Run ID: ${runId}`,
    `目标: ${plan.goal}`,
    "",
    "项目入口:"
  ];

  const doc = firstArtifact(artifacts, "doc");
  if (doc) lines.push(`- Brief: ${formatArtifactTarget(doc)}`);

  const baseRecords = artifacts.filter((artifact) => artifact.type === "base_record");
  if (baseRecords.length > 0) {
    lines.push(`- 状态台账: ${baseRecords.length} 条 Base records (${formatRecordIds(baseRecords)})`);
  }

  const task = firstArtifact(artifacts, "task");
  if (task) lines.push(`- 首个任务: ${formatArtifactTarget(task)}`);

  lines.push("", "建议: 将本消息置顶或升级为群公告，作为团队后续进入项目空间的固定入口。");
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
