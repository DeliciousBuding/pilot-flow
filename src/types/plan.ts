export type PlanIntent = "project_init";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "succeeded";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskStatus = "open" | "mitigated" | "accepted" | "closed";

export type ConfirmationStatus = "pending" | "approved" | "rejected" | "timeout";

export interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly status: StepStatus;
  readonly tool?: string;
}

export interface PlanRisk {
  readonly id: string;
  readonly title: string;
  readonly level: RiskLevel;
  readonly status: RiskStatus;
  readonly owner?: string;
  readonly recommendation?: string;
}

export interface PlanConfirmation {
  readonly id: string;
  readonly prompt: string;
  readonly status: ConfirmationStatus;
  readonly required_for: readonly string[];
}

export interface ProjectInitPlan {
  readonly intent: PlanIntent;
  readonly goal: string;
  readonly members: readonly string[];
  readonly deliverables: readonly string[];
  readonly deadline: string;
  readonly missing_info: readonly string[];
  readonly steps: readonly PlanStep[];
  readonly confirmations: readonly PlanConfirmation[];
  readonly risks: readonly PlanRisk[];
}

export type PlanValidationResult =
  | { readonly ok: true; readonly plan: ProjectInitPlan }
  | { readonly ok: false; readonly errors: readonly string[]; readonly partial?: Partial<ProjectInitPlan> };
