import { firstTaskFallbackOwner } from "./project-state-builder.js";

export function resolveTaskAssignee(plan, { ownerOpenIdMap = {}, defaultOpenId = "" } = {}) {
  const owner = firstTaskFallbackOwner(plan);
  const mappedOpenId = lookupOwnerOpenId(owner, ownerOpenIdMap);
  const assignee = mappedOpenId || defaultOpenId || "";

  return {
    owner,
    assignee,
    source: mappedOpenId ? "owner_open_id_map" : assignee ? "default_task_assignee" : "unmapped"
  };
}

export function applyDefaultTaskAssignee(taskAssignee, defaultOpenId = "") {
  if (taskAssignee?.assignee || !defaultOpenId) return taskAssignee;
  return {
    ...taskAssignee,
    assignee: defaultOpenId,
    source: "default_task_assignee"
  };
}

export function lookupOwnerOpenId(owner, ownerOpenIdMap = {}) {
  if (!owner || !ownerOpenIdMap || typeof ownerOpenIdMap !== "object") return "";
  if (typeof ownerOpenIdMap[owner] === "string") return ownerOpenIdMap[owner];

  const normalizedOwner = normalizeOwnerKey(owner);
  const match = Object.entries(ownerOpenIdMap).find(([key]) => normalizeOwnerKey(key) === normalizedOwner);
  return typeof match?.[1] === "string" ? match[1] : "";
}

function normalizeOwnerKey(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}
