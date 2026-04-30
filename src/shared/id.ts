import { createHash, randomUUID } from "node:crypto";
import type { ProjectInitPlan } from "../types/plan.js";

export function generateRunId(prefix = "run"): string {
  return `${prefix}-${randomUUID()}`;
}

export function buildDedupeKey(plan: ProjectInitPlan, scope: Record<string, unknown> = {}): string {
  const payload = {
    intent: plan.intent,
    goal: normalizeText(plan.goal),
    deadline: normalizeText(plan.deadline),
    deliverables: plan.deliverables.map(normalizeText),
    scopeHash: hashValue(scope).slice(0, 16),
  };
  return `project_init:${hashValue(payload).slice(0, 24)}`;
}

export function buildIdempotencyKey(runId: string, tool: string, sequence: number): string {
  const digest = hashValue({ runId, tool, sequence }).slice(0, 24);
  return `pf-${digest}`;
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
