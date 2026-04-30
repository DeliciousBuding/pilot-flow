import type { ProjectInitPlan } from "../types/plan.js";
import { firstTaskFallbackOwner } from "./project-state.js";

export interface TaskAssignee {
  readonly owner: string;
  readonly assignee: string;
  readonly source: "owner_open_id_map" | "default_task_assignee" | "unmapped" | "contact_lookup_exact" | "contact_lookup_unique" | "contact_lookup_unresolved";
  readonly contact_lookup?: Record<string, unknown>;
}

export function resolveTaskAssignee(plan: ProjectInitPlan, { ownerOpenIdMap = {}, defaultOpenId = "" }: { readonly ownerOpenIdMap?: Record<string, string>; readonly defaultOpenId?: string } = {}): TaskAssignee {
  const owner = firstTaskFallbackOwner(plan);
  const mappedOpenId = lookupOwnerOpenId(owner, ownerOpenIdMap);
  const assignee = mappedOpenId || defaultOpenId || "";
  return { owner, assignee, source: mappedOpenId ? "owner_open_id_map" : assignee ? "default_task_assignee" : "unmapped" };
}

export function applyDefaultTaskAssignee(taskAssignee: TaskAssignee, defaultOpenId = ""): TaskAssignee {
  if (taskAssignee.assignee || !defaultOpenId) return taskAssignee;
  return { ...taskAssignee, assignee: defaultOpenId, source: "default_task_assignee" };
}

export function lookupOwnerOpenId(owner: string, ownerOpenIdMap: Record<string, string> = {}): string {
  if (!owner) return "";
  if (typeof ownerOpenIdMap[owner] === "string") return ownerOpenIdMap[owner] ?? "";
  const normalizedOwner = normalizeOwnerKey(owner);
  const match = Object.entries(ownerOpenIdMap).find(([key]) => normalizeOwnerKey(key) === normalizedOwner);
  return match?.[1] ?? "";
}

function normalizeOwnerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
