import type { ProjectInitPlan } from "../../src/types/plan.js";

export function samplePlan(overrides: Partial<ProjectInitPlan> = {}): ProjectInitPlan {
  return {
    intent: "project_init",
    goal: "Build PilotFlow demo",
    members: ["唐丁"],
    deliverables: ["Project brief", "Status table"],
    deadline: "2026-05-05",
    missing_info: [],
    steps: [{ id: "step-doc", title: "Create doc", status: "pending", tool: "doc.create" }],
    confirmations: [],
    risks: [],
    ...overrides,
  };
}
