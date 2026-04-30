import type {
  ConfirmationStatus,
  PlanConfirmation,
  PlanRisk,
  PlanStep,
  ProjectInitPlan,
  RiskLevel,
  RiskStatus,
  StepStatus,
} from "../types/plan.js";

const DEFAULT_DEADLINE = "TBD";
const DETERMINISTIC_PROVIDER = "deterministic-prototype";

const STEP_STATUSES = new Set<StepStatus>(["pending", "running", "failed", "skipped", "succeeded"]);
const CONFIRMATION_STATUSES = new Set<ConfirmationStatus>(["pending", "approved", "rejected", "expired"]);
const RISK_LEVELS = new Set<RiskLevel>(["low", "medium", "high", "critical"]);
const RISK_STATUSES = new Set<RiskStatus>(["open", "accepted", "mitigated", "closed"]);
const INLINE_FIELD_LABELS = [
  "goal",
  "目标",
  "members",
  "成员",
  "负责人",
  "deliverables",
  "交付物",
  "成果",
  "deadline",
  "截止时间",
  "risks",
  "风险",
];

export interface PlannerProvider {
  readonly provider?: string;
  plan(inputText: string): ProjectInitPlan | Promise<ProjectInitPlan>;
}

export interface CreatePlannerOptions {
  readonly type?: string;
}

export interface PlanValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type DetailedPlanValidationResult =
  | { readonly ok: true; readonly plan: ProjectInitPlan; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly PlanValidationIssue[] };

export class DeterministicPlanner implements PlannerProvider {
  public readonly provider: string;

  constructor({ provider = DETERMINISTIC_PROVIDER }: { readonly provider?: string } = {}) {
    this.provider = provider;
  }

  plan(inputText: string): ProjectInitPlan {
    return createProjectInitPlan(inputText);
  }
}

export function createProjectInitPlannerProvider({ type = DETERMINISTIC_PROVIDER }: CreatePlannerOptions = {}): PlannerProvider {
  if (type !== DETERMINISTIC_PROVIDER && type !== "deterministic") {
    throw new Error(`Unsupported project-init planner provider: ${type}`);
  }

  return new DeterministicPlanner({ provider: type });
}

export function createProjectInitPlan(inputText: string): ProjectInitPlan {
  const normalizedInput = normalizeProjectInputText(inputText);
  const fields = parseDemoInput(normalizedInput);
  const firstLine = normalizedInput.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
  const goal = fields.goal ?? fields["目标"] ?? firstLine ?? "Launch a project from group discussion";
  const members = splitList(fields.members ?? fields["成员"] ?? fields["负责人"]);
  const deliverables = splitList(fields.deliverables ?? fields["交付物"] ?? fields["成果"]);
  const risks = splitList(fields.risks ?? fields["风险"]).map((title, index): PlanRisk => ({
    id: `risk-${index + 1}`,
    title,
    level: "medium",
    status: "open",
  }));

  const missingInfo: string[] = [];
  if (members.length === 0) missingInfo.push("members");
  if (deliverables.length === 0) missingInfo.push("deliverables");
  if (!fields.deadline && !fields["截止时间"]) missingInfo.push("deadline");

  return {
    intent: "project_init",
    goal,
    members,
    deliverables,
    deadline: fields.deadline ?? fields["截止时间"] ?? DEFAULT_DEADLINE,
    missing_info: missingInfo,
    steps: defaultSteps(),
    confirmations: [
      {
        id: "confirm-execute",
        prompt: "Confirm the execution plan before PilotFlow writes project artifacts.",
        status: "pending",
        required_for: [
          "step-doc",
          "step-state",
          "step-task",
          "step-risk",
          "step-entry",
          "step-announcement",
          "step-pin",
          "step-summary",
        ],
      },
    ],
    risks,
  };
}

export function parseDemoInput(inputText: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of normalizeProjectInputText(inputText).split(/\r?\n/)) {
    const inlineFields = parseInlineKnownFields(line);
    if (inlineFields.length > 0) {
      for (const [key, value] of inlineFields) {
        result[key] = value;
      }
      continue;
    }
    const match = line.match(/^([\w\u4e00-\u9fff ]+):\s*(.+)$/u);
    if (!match) continue;
    const key = normalizeFieldKey(match[1] ?? "");
    const value = (match[2] ?? "").trim();
    if (key && value) result[key] = value;
  }
  return result;
}

export function normalizeProjectInputText(value: string): string {
  return value.replaceAll("^", "");
}

function parseInlineKnownFields(line: string): readonly (readonly [string, string])[] {
  const labelPattern = INLINE_FIELD_LABELS.map(escapeRegExp).join("|");
  const matcher = new RegExp(`(^|\\s)(${labelPattern}):\\s*`, "giu");
  const matches = [...line.matchAll(matcher)];
  if (matches.length <= 1) return [];

  return matches.map((match, index): readonly [string, string] => {
    const rawKey = match[2] ?? "";
    const valueStart = match.index + match[0].length;
    const nextMatch = matches[index + 1];
    const valueEnd = nextMatch ? nextMatch.index : line.length;
    return [normalizeFieldKey(rawKey), line.slice(valueStart, valueEnd).trim()];
  }).filter(([, value]) => value.length > 0);
}

export function validatePlan(plan: unknown): DetailedPlanValidationResult {
  const errors: PlanValidationIssue[] = [];

  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, errors: [{ path: "$", message: "plan must be an object" }] };
  }

  const candidate = plan as Record<string, unknown>;
  for (const field of ["intent", "goal", "members", "deliverables", "deadline", "steps", "confirmations", "risks"]) {
    if (candidate[field] === undefined) errors.push({ path: field, message: "is required" });
  }

  if (candidate.intent !== undefined && candidate.intent !== "project_init") {
    errors.push({ path: "intent", message: "must equal project_init" });
  }
  requireString(candidate.goal, "goal", errors, { maxLength: 500 });
  requireString(candidate.deadline, "deadline", errors, { maxLength: 120 });
  requireStringArray(candidate.members, "members", errors, { maxItems: 50, maxItemLength: 120 });
  requireStringArray(candidate.deliverables, "deliverables", errors, { maxItems: 50, maxItemLength: 200 });
  if (candidate.missing_info !== undefined) {
    requireStringArray(candidate.missing_info, "missing_info", errors, { maxItems: 50, maxItemLength: 120 });
  }
  requireObjectArray(candidate.steps, "steps", errors, validateStep, { maxItems: 50 });
  requireObjectArray(candidate.confirmations, "confirmations", errors, validateConfirmation, { maxItems: 20 });
  requireObjectArray(candidate.risks, "risks", errors, validateRisk, { maxItems: 50 });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan: candidate as unknown as ProjectInitPlan, errors: [] };
}

export function buildFallbackPlan(errors: readonly (PlanValidationIssue | string)[], inputText = ""): ProjectInitPlan {
  const issuePaths = errors.map((error) => {
    const path = typeof error === "string" ? error.split(":")[0] ?? error : error.path;
    return path.split(/[.[\]]/u).find(Boolean) ?? path;
  });
  const missingInfo = [...new Set(issuePaths.filter(Boolean))];
  const sourceSummary = inputText.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "project request";

  return {
    intent: "project_init",
    goal: `Clarify project launch request before writing Feishu artifacts: ${sourceSummary}`,
    members: [],
    deliverables: ["Clarify goal, owners, deliverables, and deadline"],
    deadline: DEFAULT_DEADLINE,
    missing_info: ["valid plan schema", ...missingInfo],
    steps: [
      {
        id: "step-clarify",
        title: "Ask requester to clarify the project plan before Feishu writes",
        status: "pending",
      },
    ],
    confirmations: [
      {
        id: "confirm-clarify",
        prompt: "PilotFlow needs a valid project plan before creating Doc, Base, Task, or IM artifacts.",
        status: "pending",
        required_for: [],
      },
    ],
    risks: [
      {
        id: "risk-plan-validation",
        title: "planner output failed schema validation",
        level: "high",
        status: "open",
      },
    ],
  };
}

function defaultSteps(): readonly PlanStep[] {
  return [
    { id: "step-plan", title: "Generate project execution plan", status: "pending" },
    { id: "step-confirm", title: "Post execution plan card and request human confirmation", status: "pending", tool: "card.send" },
    { id: "step-doc", title: "Create project brief document", status: "pending", tool: "doc.create" },
    { id: "step-state", title: "Write tasks and risks to project state", status: "pending", tool: "base.write" },
    { id: "step-task", title: "Create first task with owner/deadline fallback context", status: "pending", tool: "task.create" },
    { id: "step-risk", title: "Build risk decision card", status: "pending", tool: "card.send" },
    { id: "step-entry", title: "Send project entry message", status: "pending", tool: "entry.send" },
    { id: "step-announcement", title: "Try to upgrade project entry to group announcement", status: "pending", tool: "announcement.update" },
    { id: "step-pin", title: "Pin project entry message", status: "pending", tool: "entry.pin" },
    { id: "step-summary", title: "Send delivery summary", status: "pending", tool: "im.send" },
  ];
}

function validateStep(step: Record<string, unknown>, path: string, errors: PlanValidationIssue[]): void {
  requireString(step.id, `${path}.id`, errors, { maxLength: 100 });
  requireString(step.title, `${path}.title`, errors, { maxLength: 200 });
  requireEnum(step.status, STEP_STATUSES, `${path}.status`, errors);
  if (step.tool !== undefined) requireString(step.tool, `${path}.tool`, errors, { maxLength: 100 });
  if (step.depends_on !== undefined) requireStringArray(step.depends_on, `${path}.depends_on`, errors, { maxItems: 50, maxItemLength: 100 });
}

function validateConfirmation(confirmation: Record<string, unknown>, path: string, errors: PlanValidationIssue[]): void {
  requireString(confirmation.id, `${path}.id`, errors, { maxLength: 100 });
  requireString(confirmation.prompt, `${path}.prompt`, errors, { maxLength: 500 });
  requireEnum(confirmation.status, CONFIRMATION_STATUSES, `${path}.status`, errors);
  requireStringArray(confirmation.required_for, `${path}.required_for`, errors, { maxItems: 50, maxItemLength: 100 });
}

function validateRisk(risk: Record<string, unknown>, path: string, errors: PlanValidationIssue[]): void {
  requireString(risk.id, `${path}.id`, errors, { maxLength: 100 });
  requireString(risk.title, `${path}.title`, errors, { maxLength: 200 });
  requireEnum(risk.level, RISK_LEVELS, `${path}.level`, errors);
  requireEnum(risk.status, RISK_STATUSES, `${path}.status`, errors);
  if (risk.owner !== undefined) requireString(risk.owner, `${path}.owner`, errors, { maxLength: 120 });
  if (risk.recommendation !== undefined) requireString(risk.recommendation, `${path}.recommendation`, errors, { maxLength: 500 });
  if (risk.source_run !== undefined) requireString(risk.source_run, `${path}.source_run`, errors, { maxLength: 120 });
}

function requireString(
  value: unknown,
  path: string,
  errors: PlanValidationIssue[],
  options: { readonly maxLength: number },
): void {
  if (typeof value !== "string") {
    errors.push({ path, message: "must be a string" });
    return;
  }
  if (value.trim().length === 0) errors.push({ path, message: "must not be empty" });
  if (value.length > options.maxLength) errors.push({ path, message: `must be at most ${options.maxLength} characters` });
}

function requireStringArray(
  value: unknown,
  path: string,
  errors: PlanValidationIssue[],
  options: { readonly maxItems: number; readonly maxItemLength: number },
): void {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array" });
    return;
  }
  if (value.length > options.maxItems) errors.push({ path, message: `must contain at most ${options.maxItems} items` });
  value.forEach((item, index) => {
    requireString(item, `${path}[${index}]`, errors, { maxLength: options.maxItemLength });
  });
}

function requireObjectArray(
  value: unknown,
  path: string,
  errors: PlanValidationIssue[],
  validateItem: (item: Record<string, unknown>, path: string, errors: PlanValidationIssue[]) => void,
  options: { readonly maxItems: number },
): void {
  if (!Array.isArray(value)) {
    errors.push({ path, message: "must be an array" });
    return;
  }
  if (value.length > options.maxItems) errors.push({ path, message: `must contain at most ${options.maxItems} items` });
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ path: `${path}[${index}]`, message: "must be an object" });
      return;
    }
    validateItem(item as Record<string, unknown>, `${path}[${index}]`, errors);
  });
}

function requireEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, path: string, errors: PlanValidationIssue[]): void {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    errors.push({ path, message: `must be one of: ${[...allowed].join(", ")}` });
  }
}

function normalizeFieldKey(key: string): string {
  return key.trim().toLowerCase().replaceAll(" ", "_");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitList(value = ""): readonly string[] {
  return value
    .split(/[,;，；]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}
