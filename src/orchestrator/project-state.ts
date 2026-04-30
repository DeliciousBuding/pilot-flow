import type { Artifact } from "../types/artifact.js";
import type { PlanRisk, ProjectInitPlan } from "../types/plan.js";

export const PROJECT_STATE_FIELDS = ["type", "title", "owner", "due_date", "status", "risk_level", "source_run", "source_message", "url"] as const;

export function buildProjectStateRows(plan: ProjectInitPlan, { runId, artifacts = [], risks = plan.risks, sourceMessage = "manual-trigger" }: { readonly runId: string; readonly artifacts?: readonly Artifact[]; readonly risks?: readonly PlanRisk[]; readonly sourceMessage?: string }): readonly (readonly string[])[] {
  const doc = artifacts.find((artifact) => artifact.type === "doc");
  const dueDate = normalizeDueDateText(plan.deadline);
  const taskRows = plan.deliverables.map((item, index) => rowToArray({
    type: "task", title: item, owner: ownerFallback(plan, index), due_date: dueDate, status: "todo", risk_level: "", source_run: runId, source_message: sourceMessage, url: "",
  }));
  const riskRows = risks.map((risk, index) => rowToArray({
    type: "risk", title: risk.title, owner: risk.owner || ownerFallback(plan, index), due_date: dueDate, status: risk.status || "open", risk_level: risk.level || "medium", source_run: runId, source_message: sourceMessage, url: "",
  }));
  const artifactRows = [rowToArray({
    type: "artifact", title: "Project brief document", owner: ownerFallback(plan, 0), due_date: dueDate, status: artifactStatus(doc) === "created" ? "created" : "planned", risk_level: "", source_run: runId, source_message: sourceMessage, url: doc?.url || "",
  })];
  return [...taskRows, ...riskRows, ...artifactRows];
}

export function firstTaskSummary(plan: ProjectInitPlan): string {
  return plan.deliverables[0] || `Kick off: ${plan.goal}`;
}

export function firstTaskFallbackOwner(plan: ProjectInitPlan): string {
  return ownerFallback(plan, 0);
}

export function normalizeDueDate(deadline: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : undefined;
}

export function normalizeDueDateText(deadline: string): string {
  return normalizeDueDate(deadline) || "TBD";
}

function rowToArray(row: Record<(typeof PROJECT_STATE_FIELDS)[number], string>): readonly string[] {
  return PROJECT_STATE_FIELDS.map((field) => row[field] ?? "");
}

function ownerFallback(plan: ProjectInitPlan, index: number): string {
  const members = plan.members.filter(Boolean);
  return members.length === 0 ? "TBD" : members[index % members.length] ?? "TBD";
}

function artifactStatus(artifact?: Artifact): string {
  return typeof artifact?.metadata?.status === "string" ? artifact.metadata.status : "";
}
