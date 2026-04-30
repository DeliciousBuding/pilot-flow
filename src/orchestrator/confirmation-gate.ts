import type { ProjectInitPlan } from "../types/plan.js";
import type { DetectedRisk } from "../domain/risk.js";
import { isAcceptedConfirmationText } from "./confirmation-text.js";

export interface ConfirmationOptions {
  readonly autoConfirm?: boolean;
  readonly confirmationText?: string;
  readonly mode?: "dry-run" | "live";
}

export interface ConfirmationDecision {
  readonly approved: boolean;
  readonly status: "approved" | "waiting_confirmation" | "rejected";
  readonly reason?: string;
  readonly confirmationText?: string;
}

export interface ConfirmationGate {
  request(plan: ProjectInitPlan, risks: readonly DetectedRisk[], options: ConfirmationOptions): Promise<ConfirmationDecision>;
}

export class TextConfirmationGate implements ConfirmationGate {
  async request(_plan: ProjectInitPlan, _risks: readonly DetectedRisk[], options: ConfirmationOptions): Promise<ConfirmationDecision> {
    if (options.autoConfirm === false) return { approved: false, status: "waiting_confirmation", reason: "auto_confirm_disabled" };
    if (options.mode !== "live") return { approved: true, status: "approved", confirmationText: options.confirmationText || "auto-confirmed dry-run" };
    if (isAcceptedConfirmationText(options.confirmationText ?? "")) return { approved: true, status: "approved", confirmationText: options.confirmationText };
    return { approved: false, status: "waiting_confirmation", reason: "missing_live_confirmation_text", confirmationText: options.confirmationText };
  }
}
