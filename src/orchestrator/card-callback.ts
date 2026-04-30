import type { RunOptions, RunResult } from "./orchestrator.js";
import { PRIMARY_CONFIRMATION_TEXT } from "./confirmation-text.js";

const EXECUTION_PLAN_CARD_TYPE = "execution_plan";
const LEGACY_EXECUTION_PLAN_CARD_TYPES = ["flight_plan"] as const;
const EXECUTION_PLAN_CARD_TYPES = new Set<string>([EXECUTION_PLAN_CARD_TYPE, ...LEGACY_EXECUTION_PLAN_CARD_TYPES]);

const EXECUTION_PLAN_ACTIONS = new Map([
  ["confirm_execute", { status: "approved", next: "run_full_project_init", message: "Plan confirmed. Continue with Doc, Base, Task, risk, entry, and summary steps." }],
  ["confirm_takeoff", { status: "approved", next: "run_full_project_init", message: "Plan confirmed. Continue with Doc, Base, Task, risk, entry, and summary steps." }],
  ["edit_plan", { status: "needs_edit", next: "request_plan_edit", message: "Requester wants to edit the execution plan before Feishu writes." }],
  ["doc_only", { status: "approved_doc_only", next: "run_doc_only", message: "Execution plan confirmed for document-only execution." }],
  ["cancel", { status: "cancelled", next: "stop_run", message: "Execution plan was cancelled before Feishu project artifacts were written." }],
]);

const RISK_ACTIONS = new Map([
  ["assign_owner", { status: "needs_owner", next: "request_owner_mapping", message: "Risk decision requests owner confirmation or reassignment." }],
  ["adjust_deadline", { status: "needs_deadline", next: "request_deadline_update", message: "Risk decision requests a deadline adjustment." }],
  ["accept_risk", { status: "accepted", next: "record_risk_acceptance", message: "Risk accepted and should remain tracked." }],
  ["defer", { status: "deferred", next: "pause_risk_action", message: "Risk action deferred." }],
]);

export interface CardActionDecision {
  readonly status: string;
  readonly next: string;
  readonly message: string;
}

export interface ExtractedCardAction {
  readonly card: string;
  readonly action: string;
  readonly runId: string;
  readonly userId: string;
  readonly decision: CardActionDecision;
}

export interface CallbackOrchestrator {
  run(inputText: string, options?: RunOptions): Promise<RunResult | Record<string, unknown>>;
}

export function extractCardAction(payload: Record<string, unknown> = {}): ExtractedCardAction | null {
  const value = extractCardActionValue(payload);
  const action = stringValue(value.pilotflow_action);
  const card = stringValue(value.pilotflow_card) || inferCardFromAction(action);
  const runId = stringValue(value.pilotflow_run_id) || getString(payload, ["event", "context", "run_id"]) || getString(payload, ["context", "run_id"]) || "";
  const userId = getString(payload, ["event", "operator", "open_id"]) || getString(payload, ["event", "operator", "operator_id", "open_id"]) || getString(payload, ["operator", "open_id"]) || "";
  const decision = decisionFor(card, action);
  return action && decision ? { card, action, runId, userId, decision } : null;
}

export async function handleCardCallback(
  actionOrPayload: ExtractedCardAction | Record<string, unknown> | null,
  orchestrator?: CallbackOrchestrator,
  options: { readonly inputText?: string; readonly runOptions?: RunOptions } = {},
): Promise<RunResult | Record<string, unknown>> {
  const action = isExtractedAction(actionOrPayload) ? actionOrPayload : extractCardAction(actionOrPayload ?? {});
  if (!action) return rejected("", "", "", "", "unsupported_action");
  if (!orchestrator) return { ok: true, card: action.card, action: action.action, run_id: action.runId, user_id: action.userId, decision: action.decision };
  if (EXECUTION_PLAN_CARD_TYPES.has(action.card) && action.decision.next === "run_full_project_init") {
    return orchestrator.run(options.inputText ?? "", {
      ...options.runOptions,
      autoConfirm: true,
      confirmationText: PRIMARY_CONFIRMATION_TEXT,
    });
  }
  return { ok: true, card: action.card, action: action.action, run_id: action.runId, user_id: action.userId, decision: action.decision };
}

export function extractCardActionValue(payload: Record<string, unknown> = {}): Record<string, unknown> {
  const action = objectAt(payload, ["event", "action"]) ?? objectAt(payload, ["action"]) ?? {};
  const value = action.value ?? getUnknown(payload, ["event", "action_value"]) ?? payload.value ?? {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { pilotflow_action: value };
    } catch {
      return { pilotflow_action: value };
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function decisionFor(card: string, action: string): CardActionDecision | undefined {
  return EXECUTION_PLAN_CARD_TYPES.has(card) ? EXECUTION_PLAN_ACTIONS.get(action) : card === "risk_decision" ? RISK_ACTIONS.get(action) : undefined;
}

function inferCardFromAction(action: string): string {
  if (EXECUTION_PLAN_ACTIONS.has(action)) return EXECUTION_PLAN_CARD_TYPE;
  if (RISK_ACTIONS.has(action)) return "risk_decision";
  return "";
}

function rejected(card: string, action: string, runId: string, userId: string, reason: string): Record<string, unknown> {
  return { ok: false, card, action, run_id: runId, user_id: userId, reason };
}

function isExtractedAction(value: unknown): value is ExtractedCardAction {
  return Boolean(value && typeof value === "object" && "decision" in value && "action" in value);
}

function objectAt(value: Record<string, unknown>, path: readonly string[]): Record<string, unknown> | undefined {
  const result = getUnknown(value, path);
  return result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : undefined;
}

function getUnknown(value: Record<string, unknown>, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, key) => (current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>)[key] : undefined), value);
}

function getString(value: Record<string, unknown>, path: readonly string[]): string {
  return stringValue(getUnknown(value, path));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
