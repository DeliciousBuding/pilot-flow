import { buildFallbackPlan, validatePlan, type PlannerProvider } from "../domain/plan.js";
import { detectRisks, summarizeRiskDecision, type DetectedRisk, type RiskDecisionSummary } from "../domain/risk.js";
import { generateRunId } from "../shared/id.js";
import type { Artifact } from "../types/artifact.js";
import type { RuntimeConfig } from "../types/config.js";
import type { FeishuTargets } from "../types/feishu.js";
import type { ProjectInitPlan } from "../types/plan.js";
import type { Recorder, RunStatus } from "../types/recorder.js";
import type { ToolRegistry } from "../tools/registry.js";
import { applyDefaultTaskAssignee, resolveTaskAssignee, type TaskAssignee } from "./assignee-resolver.js";
import { type ConfirmationGate } from "./confirmation-gate.js";
import { buildProjectInitDedupeKey, duplicateGuardSummary, DuplicateGuard } from "./duplicate-guard.js";
import { resolveContactAssignee } from "./contact-resolver.js";
import { buildPlanCardStep, buildToolSequence, executeToolSequence, preflightToolSequence, type RunSequenceOptions } from "./tool-sequence.js";

export interface OrchestratorConfig {
  readonly planner: PlannerProvider;
  readonly registry?: ToolRegistry;
  readonly tools?: ToolRegistry;
  readonly recorder: Recorder;
  readonly confirmationGate: ConfirmationGate;
  readonly duplicateGuard: DuplicateGuard;
  readonly runtime: RuntimeConfig;
}

export interface RunOptions extends RunSequenceOptions {
  readonly autoConfirm?: boolean;
  readonly confirmationText?: string;
  readonly ownerOpenIdMap?: Record<string, string>;
  readonly taskAssigneeOpenId?: string;
  readonly autoLookupOwnerContact?: boolean;
  readonly dedupeKey?: string;
  readonly sourceMessage?: string;
}

export interface RunResult {
  readonly runId: string;
  readonly status: RunStatus;
  readonly plan?: ProjectInitPlan;
  readonly risks?: readonly DetectedRisk[];
  readonly riskDecision?: RiskDecisionSummary;
  readonly risk_decision?: RiskDecisionSummary;
  readonly artifacts: readonly Artifact[];
  readonly error?: string;
  readonly duplicateGuard?: Record<string, unknown>;
  readonly duplicate_guard?: Record<string, unknown>;
}

export class Orchestrator {
  private readonly registry: ToolRegistry;

  constructor(private readonly config: OrchestratorConfig) {
    const registry = config.registry ?? config.tools;
    if (!registry) throw new Error("Orchestrator requires a ToolRegistry");
    this.registry = registry;
  }

  async run(inputText: string, options: RunOptions = {}): Promise<RunResult> {
    const runId = generateRunId();
    const artifacts: Artifact[] = [];
    const mode = this.config.runtime.mode;
    const dryRun = mode !== "live";

    await this.record({ type: "run.created", event: "run.created", runId, run_id: runId, intent: "project_init", mode });

    const rawPlan = await this.config.planner.plan(inputText);
    const validation = validatePlan(rawPlan);
    const plan = validation.ok ? validation.plan : buildFallbackPlan(validation.errors, inputText);
    await this.record({ type: "plan.generated", event: "plan.generated", runId, run_id: runId, plan, plan_validation: validation });

    const risks = detectRisks(plan);
    const riskDecision = summarizeRiskDecision(risks);
    await this.record({ type: "risk.detected", event: "risk.detected", runId, run_id: runId, risks, risk_decision: riskDecision });

    if (!validation.ok) {
      await this.record({ type: "plan.validation_failed", event: "plan.validation_failed", runId, run_id: runId, validation_errors: validation.errors, fallback: { status: "needs_clarification", missing_info: plan.missing_info } });
      await this.record({ type: "run.waiting_clarification", event: "run.waiting_clarification", runId, run_id: runId, missing_info: plan.missing_info, failed_before_side_effects: true });
      return { runId, status: "needs_clarification", plan, risks, riskDecision, risk_decision: riskDecision, artifacts, duplicateGuard: { enabled: false, status: "skipped", reason: "invalid_plan" }, duplicate_guard: { enabled: false, status: "skipped", reason: "invalid_plan" } };
    }

    const dedupeKey = buildProjectInitDedupeKey({ plan, explicitKey: options.dedupeKey, scope: { profile: this.config.runtime.profile, targets: targetScope(this.config.runtime.feishuTargets) } });
    let guardState: Record<string, unknown> = { enabled: false, key: dedupeKey, status: "skipped", reason: "no_live_side_effects" };
    let mainGuardStarted = false;

    try {
      if (options.sendPlanCard) {
        const planCardSequence = [buildPlanCardStep()];
        let planCardKey = "";
        if (!dryRun) {
          preflightToolSequence(this.registry, planCardSequence, this.config.runtime.feishuTargets);
          planCardKey = `${dedupeKey}:plan-card`;
          guardState = await this.startGuard(runId, planCardKey, plan);
        }
        const planCardArtifacts = await executeToolSequence({
          runId,
          registry: this.registry,
          recorder: this.config.recorder,
          dryRun,
          confirmed: true,
          profile: this.config.runtime.profile,
          targets: this.config.runtime.feishuTargets,
          sequence: planCardSequence,
          context: { runId, plan, risks, riskDecision, options, artifacts, sourceMessage: options.sourceMessage },
        });
        artifacts.splice(0, artifacts.length, ...planCardArtifacts);
        if (planCardKey) await this.config.duplicateGuard.complete({ key: planCardKey, runId, artifactCount: planCardArtifacts.length });
      }

      await this.record({ type: "confirmation.requested", event: "confirmation.requested", runId, run_id: runId, confirmation: plan.confirmations[0] });
      const confirmation = await this.config.confirmationGate.request(plan, risks, { autoConfirm: options.autoConfirm ?? this.config.runtime.autoConfirm, confirmationText: options.confirmationText, mode });
      if (!confirmation.approved) {
        await this.record({ type: "run.waiting_confirmation", event: "run.waiting_confirmation", runId, run_id: runId, expected_confirmation_text: "确认起飞", received_confirmation_text: options.confirmationText || null });
        return { runId, status: "waiting_confirmation", plan, risks, riskDecision, risk_decision: riskDecision, artifacts, duplicateGuard: guardState, duplicate_guard: guardState };
      }
      await this.record({ type: "confirmation.approved", event: "confirmation.approved", runId, run_id: runId, confirmation: { ...plan.confirmations[0], status: "approved", confirmation_text: confirmation.confirmationText } });

      let taskAssignee = resolveTaskAssignee(plan, { ownerOpenIdMap: options.ownerOpenIdMap, defaultOpenId: options.autoLookupOwnerContact ? "" : options.taskAssigneeOpenId });
      if (options.autoLookupOwnerContact && !taskAssignee.assignee) taskAssignee = applyDefaultTaskAssignee(await this.lookupOwnerContact(runId, taskAssignee), options.taskAssigneeOpenId);

      const sequenceContext = { runId, plan, risks, riskDecision, options, artifacts, taskAssignee, sourceMessage: options.sourceMessage };
      const sequence = buildToolSequence(sequenceContext);
      if (!dryRun) {
        preflightToolSequence(this.registry, sequence, this.config.runtime.feishuTargets, sequenceContext);
        if (!mainGuardStarted) {
          guardState = await this.startGuard(runId, dedupeKey, plan);
          mainGuardStarted = true;
        }
      }
      const runArtifacts = await executeToolSequence({
        runId,
        registry: this.registry,
        recorder: this.config.recorder,
        dryRun,
        confirmed: true,
        profile: this.config.runtime.profile,
        targets: this.config.runtime.feishuTargets,
        sequence,
        context: { ...sequenceContext, artifacts },
      });
      artifacts.splice(0, artifacts.length, ...runArtifacts);
      const runLogArtifact: Artifact = { type: "run_log", external_id: `artifact-${runId}-log`, title: "JSONL run log", metadata: { status: "created" } };
      artifacts.push(runLogArtifact);
      await this.record({ type: "artifact.created", event: "artifact.created", runId, run_id: runId, artifact: runLogArtifact });
      await this.config.duplicateGuard.complete({ key: dedupeKey, runId, artifactCount: artifacts.length });
      await this.record({ type: "run.completed", event: "run.completed", runId, run_id: runId });
      return { runId, status: "completed", plan, risks, riskDecision, risk_decision: riskDecision, artifacts, duplicateGuard: guardState, duplicate_guard: guardState };
    } catch (error) {
      await this.config.duplicateGuard.fail({ key: dedupeKey, runId, artifactCount: artifacts.length });
      await this.record({ type: "run.failed", event: "run.failed", runId, run_id: runId, error: { message: safeErrorMessage(error) }, failed_before_side_effects: artifacts.length === 0 });
      throw error;
    }
  }

  private async startGuard(runId: string, key: string, plan: ProjectInitPlan): Promise<Record<string, unknown>> {
    const state = await this.config.duplicateGuard.start({ key, runId, summary: duplicateGuardSummary({ plan, mode: this.config.runtime.mode, profile: this.config.runtime.profile }) });
    const serializable = { ...state };
    await this.record({ type: "guard.started", event: "run.guard_checked", runId, run_id: runId, duplicate_guard: serializable });
    return serializable;
  }

  private async lookupOwnerContact(runId: string, taskAssignee: TaskAssignee): Promise<TaskAssignee> {
    try {
      const result = await this.registry.execute("contact.search", { query: taskAssignee.owner, pageSize: 5 }, { runId, sequence: 0, dryRun: this.config.runtime.mode !== "live", confirmed: true, recorder: this.config.recorder, profile: this.config.runtime.profile, targets: { ...this.config.runtime.feishuTargets } });
      const resolved = resolveContactAssignee(taskAssignee.owner, result.output as Record<string, unknown>);
      await this.record({ type: "owner.lookup_completed", event: "owner.lookup_completed", runId, run_id: runId, owner: taskAssignee.owner, contact_lookup: resolved.contact_lookup });
      return resolved.assignee ? resolved : { ...taskAssignee, source: resolved.source, contact_lookup: resolved.contact_lookup };
    } catch (error) {
      await this.record({ type: "owner.lookup_failed", event: "owner.lookup_failed", runId, run_id: runId, owner: taskAssignee.owner, error: { message: safeErrorMessage(error) } });
      return { ...taskAssignee, contact_lookup: { status: "failed", reason: safeErrorMessage(error) } };
    }
  }

  private async record(event: Record<string, unknown>): Promise<void> {
    await this.config.recorder.record(event as never);
  }
}

function targetScope(targets: FeishuTargets): Record<string, unknown> {
  return { chat: Boolean(targets.chatId), base: Boolean(targets.baseToken && targets.baseTableId), task: Boolean(targets.tasklistId) };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
