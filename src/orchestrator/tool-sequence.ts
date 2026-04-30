import { buildBriefMarkdown } from "../domain/project-brief.js";
import { buildTaskDescription } from "../domain/task-description.js";
import { buildRiskDecisionCard } from "../domain/risk-decision-card.js";
import type { DetectedRisk, RiskDecisionSummary } from "../domain/risk.js";
import type { Artifact, ArtifactType } from "../types/artifact.js";
import type { FeishuTargets } from "../types/feishu.js";
import type { ProjectInitPlan } from "../types/plan.js";
import type { Recorder } from "../types/recorder.js";
import type { ToolContext } from "../types/tool.js";
import type { ToolRegistry } from "../tools/registry.js";
import { buildEntryAnnouncementHtml, buildEntryMessageText } from "./entry-message.js";
import { buildFlightPlanCard } from "./flight-plan-card.js";
import { PROJECT_STATE_FIELDS, buildProjectStateRows, firstTaskSummary, normalizeDueDate } from "./project-state.js";
import { buildSummaryText } from "./summary-builder.js";
import type { TaskAssignee } from "./assignee-resolver.js";

export interface RunSequenceOptions {
  readonly sendPlanCard?: boolean;
  readonly sendEntryMessage?: boolean;
  readonly pinEntryMessage?: boolean;
  readonly updateAnnouncement?: boolean;
  readonly sendRiskCard?: boolean;
}

export interface SequenceContext {
  readonly runId: string;
  readonly plan: ProjectInitPlan;
  readonly risks: readonly DetectedRisk[];
  readonly riskDecision: RiskDecisionSummary;
  readonly artifacts: readonly Artifact[];
  readonly options: RunSequenceOptions;
  readonly taskAssignee?: TaskAssignee;
  readonly sourceMessage?: string;
}

export interface SequenceStep {
  readonly id: string;
  readonly tool: string;
  readonly optional?: boolean;
  readonly input: (ctx: SequenceContext) => Record<string, unknown>;
  readonly skip?: (ctx: SequenceContext) => string | undefined;
}

export interface ExecuteSequenceOptions {
  readonly runId: string;
  readonly registry: ToolRegistry;
  readonly recorder: Recorder;
  readonly dryRun: boolean;
  readonly confirmed: boolean;
  readonly profile?: string;
  readonly targets?: FeishuTargets;
  readonly sequence: readonly SequenceStep[];
  readonly context?: Omit<SequenceContext, "artifacts"> & { readonly artifacts?: readonly Artifact[] };
}

export function buildToolSequence(ctx: SequenceContext): readonly SequenceStep[] {
  const steps: SequenceStep[] = [
    { id: "step-doc", tool: "doc.create", input: (context: SequenceContext) => ({ title: "PilotFlow Project Brief", markdown: buildBriefMarkdown(context.plan) }) },
    { id: "step-state", tool: "base.write", input: (context: SequenceContext) => ({ body: { fields: PROJECT_STATE_FIELDS, rows: buildProjectStateRows(context.plan, { runId: context.runId, artifacts: context.artifacts, risks: context.risks, sourceMessage: context.sourceMessage }) } }) },
    {
      id: "step-task",
      tool: "task.create",
      input: (context: SequenceContext) => ({
        summary: firstTaskSummary(context.plan),
        description: buildTaskDescription({ runId: context.runId, plan: context.plan, taskAssignee: context.taskAssignee ?? { owner: "TBD", source: "unmapped" }, artifacts: context.artifacts }),
        due: normalizeDueDate(context.plan.deadline),
        owner: context.taskAssignee?.owner ?? "TBD",
        assignee: context.taskAssignee?.assignee || undefined,
        assignee_source: context.taskAssignee?.source ?? "unmapped",
      }),
    },
    {
      id: "step-risk",
      tool: "card.send",
      skip: (context: SequenceContext) => context.options.sendRiskCard ? undefined : "risk decision card disabled",
      input: (context: SequenceContext) => ({ title: "PilotFlow 风险裁决卡", card: buildRiskDecisionCard({ runId: context.runId, plan: context.plan, risks: context.risks, summary: context.riskDecision }) }),
    },
    {
      id: "step-entry",
      tool: "entry.send",
      skip: (context: SequenceContext) => context.options.sendEntryMessage || context.options.pinEntryMessage || context.options.updateAnnouncement ? undefined : "entry message disabled",
      input: (context: SequenceContext) => ({ text: buildEntryMessageText({ runId: context.runId, plan: context.plan, artifacts: context.artifacts }) }),
    },
    {
      id: "step-announcement",
      tool: "announcement.update",
      optional: true,
      skip: (context: SequenceContext) => context.options.updateAnnouncement ? undefined : "announcement update disabled",
      input: (context: SequenceContext) => ({ title: "PilotFlow group announcement", html: buildEntryAnnouncementHtml({ runId: context.runId, plan: context.plan, artifacts: context.artifacts }), revision: "0" }),
    },
    {
      id: "step-pin",
      tool: "entry.pin",
      skip: (context: SequenceContext) => {
        if (!context.options.pinEntryMessage) return "entry pin disabled";
        return entryMessageId(context.artifacts) ? undefined : "entry message id unavailable";
      },
      input: (context: SequenceContext) => ({ title: "Pinned PilotFlow project entry", messageId: entryMessageId(context.artifacts) }),
    },
    { id: "step-summary", tool: "im.send", input: (context: SequenceContext) => ({ text: buildSummaryText({ runId: context.runId, plan: context.plan, artifacts: context.artifacts }) }) },
  ];
  return steps;
}

export function buildPlanCardStep(): SequenceStep {
  return {
    id: "step-confirm",
    tool: "card.send",
    input: ({ runId, plan }) => ({ title: "PilotFlow 项目飞行计划", card: buildFlightPlanCard({ runId, plan, confirmationText: "确认起飞" }) }),
  };
}

export function preflightToolSequence(registry: ToolRegistry, sequence: readonly SequenceStep[], targets: FeishuTargets = {}, context?: SequenceContext): void {
  const missing = new Set<string>();
  for (const step of sequence) {
    if (context && step.skip?.(context)) continue;
    const tool = registry.get(step.tool);
    if (!tool) throw new Error(`Tool not registered for sequence preflight: ${step.tool}`);
    for (const target of tool?.requiresTargets ?? []) {
      if (!targets[target as keyof FeishuTargets]) missing.add(`${step.tool}:${target}`);
    }
  }
  if (missing.size > 0) throw new Error(`Missing required Feishu targets before side effects: ${[...missing].join(", ")}`);
}

export async function executeToolSequence(options: ExecuteSequenceOptions): Promise<Artifact[]> {
  const artifacts = [...(options.context?.artifacts ?? [])];
  for (const [index, step] of options.sequence.entries()) {
    const sequence = index + 1;
    const currentContext = { ...options.context, artifacts } as SequenceContext;
    const skipReason = step.skip?.(currentContext);
    if (skipReason) {
      await record(options.recorder, { type: "step.status_changed", runId: options.runId, event: "step.status_changed", run_id: options.runId, step_id: step.id, status: "skipped", reason: skipReason });
      continue;
    }
    await record(options.recorder, { type: "step.status_changed", runId: options.runId, event: "step.status_changed", run_id: options.runId, step_id: step.id, status: "running" });
    try {
      const input = step.input(currentContext);
      const result = await options.registry.execute(step.tool, input, toolContext(options, sequence));
      if (result.success === false) throw new Error(result.error || `${step.tool} returned success=false`);
      const stepArtifacts = normalizeResultArtifacts(resultArtifactList(result), options.runId, step.tool);
      artifacts.push(...stepArtifacts);
      for (const artifact of stepArtifacts) {
        await record(options.recorder, { type: artifact.metadata?.status === "planned" ? "artifact.planned" : "artifact.created", runId: options.runId, event: artifact.metadata?.status === "planned" ? "artifact.planned" : "artifact.created", run_id: options.runId, tool: step.tool, tool_call_id: `tool-${sequence}`, artifact });
      }
      await record(options.recorder, { type: "step.status_changed", runId: options.runId, event: "step.status_changed", run_id: options.runId, step_id: step.id, status: "succeeded" });
    } catch (error) {
      if (!step.optional) {
        await record(options.recorder, { type: "step.status_changed", runId: options.runId, event: "step.status_changed", run_id: options.runId, step_id: step.id, status: "failed" });
        throw error;
      }
      const failed = failedArtifact(options.runId, step.tool, error);
      artifacts.push(failed);
      await record(options.recorder, { type: "artifact.failed", runId: options.runId, event: "artifact.failed", run_id: options.runId, tool_call_id: `tool-${sequence}`, artifact: failed });
      await record(options.recorder, { type: "optional_tool.fallback", runId: options.runId, event: "optional_tool.fallback", run_id: options.runId, tool: step.tool, fallback: "continue_with_existing_project_entry_path", error: { message: safeErrorMessage(error) } });
      await record(options.recorder, { type: "step.status_changed", runId: options.runId, event: "step.status_changed", run_id: options.runId, step_id: step.id, status: "succeeded", reason: "optional fallback" });
    }
  }
  return artifacts;
}

function toolContext(options: ExecuteSequenceOptions, sequence: number): ToolContext {
  return { runId: options.runId, sequence, dryRun: options.dryRun, confirmed: options.confirmed, recorder: options.recorder, profile: options.profile, targets: options.targets as Record<string, string | undefined> };
}

function resultArtifactList(result: { readonly artifact?: Artifact; readonly artifacts?: readonly Artifact[] }): readonly Artifact[] {
  return result.artifacts ?? (result.artifact ? [result.artifact] : []);
}

function normalizeResultArtifacts(artifacts: readonly Artifact[], runId: string, tool: string): readonly Artifact[] {
  if (artifacts.length > 0) return artifacts;
  return [{ type: "message", external_id: `dry-${runId}-${tool.replaceAll(".", "-")}`, title: tool, metadata: { status: "planned" } }];
}

function failedArtifact(runId: string, tool: string, error: unknown): Artifact {
  return { type: fallbackArtifactType(tool), external_id: `failed-${runId}-${tool.replaceAll(".", "-")}`, title: tool, metadata: { status: "failed", error: safeErrorMessage(error) } };
}

function fallbackArtifactType(tool: string): ArtifactType {
  if (tool === "announcement.update") return "announcement";
  if (tool === "entry.pin") return "pinned_message";
  return "message";
}

function entryMessageId(artifacts: readonly Artifact[]): string {
  const artifact = artifacts.find((item) => item.type === "entry_message");
  return artifact?.external_id ?? "";
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function record(recorder: Recorder, event: Record<string, unknown>): Promise<void> {
  await recorder.record(event as never);
}
