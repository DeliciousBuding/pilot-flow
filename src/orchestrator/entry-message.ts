import type { Artifact } from "../types/artifact.js";
import type { ProjectInitPlan } from "../types/plan.js";

export function buildEntryMessageText({ runId, plan, artifacts = [] }: { readonly runId: string; readonly plan: ProjectInitPlan; readonly artifacts?: readonly Artifact[] }): string {
  const lines = ["PilotFlow 项目入口已就绪。", "", `Run ID: ${runId}`, `目标: ${plan.goal}`, "", "项目入口:"];
  const doc = firstArtifact(artifacts, "doc");
  if (doc) lines.push(`- Brief: ${formatArtifactTarget(doc)}`);
  const baseRecords = artifacts.filter((artifact) => artifact.type === "base_record");
  if (baseRecords.length > 0) lines.push(`- 状态台账: ${baseRecords.length} 条 Base records (${formatRecordIds(baseRecords)})`);
  const task = firstArtifact(artifacts, "task");
  if (task) lines.push(`- 首个任务: ${formatArtifactTarget(task)}`);
  lines.push("", "建议: 将本消息置顶或升级为群公告，作为团队后续进入项目空间的固定入口。");
  return lines.join("\n");
}

export function buildEntryAnnouncementHtml({ runId, plan, artifacts = [] }: { readonly runId: string; readonly plan: ProjectInitPlan; readonly artifacts?: readonly Artifact[] }): string {
  const items = [`<li><b>Run ID:</b> ${escapeHtml(runId)}</li>`, `<li><b>目标:</b> ${escapeHtml(plan.goal)}</li>`];
  const doc = firstArtifact(artifacts, "doc");
  if (doc) items.push(`<li><b>Brief:</b> ${escapeHtml(formatArtifactTarget(doc))}</li>`);
  const baseRecords = artifacts.filter((artifact) => artifact.type === "base_record");
  if (baseRecords.length > 0) items.push(`<li><b>状态台账:</b> ${baseRecords.length} 条 Base records (${escapeHtml(formatRecordIds(baseRecords))})</li>`);
  const task = firstArtifact(artifacts, "task");
  if (task) items.push(`<li><b>首个任务:</b> ${escapeHtml(formatArtifactTarget(task))}</li>`);
  return `<h3>PilotFlow 项目入口</h3><ul>${items.join("")}</ul><p>本公告由 PilotFlow 自动生成；若公告 API 不可用，请使用群内置顶项目入口消息。</p>`;
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

function escapeHtml(value = ""): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
