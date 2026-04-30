import type { Artifact } from "../types/artifact.js";
import type { ProjectInitPlan } from "../types/plan.js";

export function buildSummaryText({ runId, plan, artifacts = [] }: { readonly runId: string; readonly plan: ProjectInitPlan; readonly artifacts?: readonly Artifact[] }): string {
  const lines = ["PilotFlow 已完成项目起飞。", "", `Run ID: ${runId}`, `目标: ${plan.goal}`, "", "已生成产物:"];
  const doc = firstArtifact(artifacts, "doc");
  if (doc) lines.push(`- Doc: ${formatArtifactTarget(doc)}`);
  const baseRecords = artifacts.filter((artifact) => artifact.type === "base_record");
  if (baseRecords.length > 0) lines.push(`- Base records: ${baseRecords.length} 条 (${formatRecordIds(baseRecords)})`);
  const task = firstArtifact(artifacts, "task");
  if (task) lines.push(`- Task: ${formatArtifactTarget(task)}`);
  const entry = firstArtifact(artifacts, "entry_message");
  const pinnedEntry = firstArtifact(artifacts, "pinned_message");
  if (entry) lines.push(`- Project entry: ${pinnedEntry ? "pinned, " : ""}${formatArtifactTarget(entry)}`);
  const announcement = firstArtifact(artifacts, "announcement");
  if (announcement?.metadata?.status === "created") lines.push("- Group announcement: updated");
  if (announcement?.metadata?.status === "failed") lines.push("- Group announcement: API blocked, using pinned entry fallback");
  lines.push("", "下一步: 请在群内确认负责人、截止时间和风险处理方式。");
  return lines.join("\n");
}

function firstArtifact(artifacts: readonly Artifact[], type: Artifact["type"]): Artifact | undefined {
  return artifacts.find((artifact) => artifact.type === type);
}

function formatArtifactTarget(artifact: Artifact): string {
  if (artifact.url) return `${artifact.title ?? artifact.external_id} - ${artifact.url}`;
  return `${artifact.title ?? artifact.external_id} (${artifact.external_id})`;
}

function formatRecordIds(records: readonly Artifact[]): string {
  const ids = records.map((record) => record.external_id).filter(Boolean);
  if (ids.length === 0) return "planned";
  const visible = ids.slice(0, 3).join(", ");
  return ids.length <= 3 ? visible : `${visible}, ...`;
}
