import { randomUUID } from "node:crypto";
import { createProjectInitPlan } from "../planner/project-init-planner.js";
import { buildPlanValidationFallbackPlan, validateProjectInitPlan } from "../planner/plan-validator.js";
import { FeishuToolExecutor } from "../../tools/feishu/feishu-tool-executor.js";
import { normalizeFeishuArtifacts } from "../../tools/feishu/artifact-normalizer.js";
import { buildDeliverySummaryText } from "./summary-builder.js";
import { buildFlightPlanCard } from "./flight-plan-card.js";
import { buildProjectEntryMessageText } from "./entry-message-builder.js";
import { buildProjectInitDedupeKey, duplicateGuardSummary, DuplicateRunGuard } from "./duplicate-run-guard.js";
import { resolveContactSearchAssignee } from "./contact-owner-resolver.js";
import { buildRiskDecisionCard } from "./risk-decision-card.js";
import { detectProjectRisks, summarizeRiskDecision } from "./risk-detector.js";
import { applyDefaultTaskAssignee, resolveTaskAssignee } from "./task-assignee-resolver.js";
import {
  buildProjectStateRows,
  firstTaskSummary,
  normalizeDueDate,
  PROJECT_STATE_FIELDS
} from "./project-state-builder.js";

const SIDE_EFFECT_TOOLS = ["doc.create", "base.write", "task.create", "im.send"];

export class RunOrchestrator {
  constructor({ recorder, dryRun = true, mode = "dry-run", profile, feishuTargets = {}, duplicateGuard = {}, planner = createProjectInitPlan } = {}) {
    this.recorder = recorder;
    this.mode = mode;
    this.profile = profile;
    this.feishuTargets = feishuTargets;
    this.tools = new FeishuToolExecutor({ dryRun, profile, targets: feishuTargets });
    this.duplicateGuard = new DuplicateRunGuard(duplicateGuard);
    this.planner = planner;
  }

  async startProjectInit(
    inputText,
    {
      autoConfirm = true,
      confirmationText = "",
      sendPlanCard = false,
      sendEntryMessage = false,
      pinEntryMessage = false,
      sendRiskCard = false,
      ownerOpenIdMap = {},
      taskAssigneeOpenId = "",
      autoLookupOwnerContact = false,
      dedupeKey = ""
    } = {}
  ) {
    const runId = `run-${randomUUID()}`;
    await this.recorder.record({ run_id: runId, event: "run.created", intent: "project_init", mode: this.mode });

    const rawPlan = this.planner(inputText);
    const planValidation = validateProjectInitPlan(rawPlan);
    const plan = planValidation.ok ? rawPlan : buildPlanValidationFallbackPlan(inputText, planValidation.errors);
    await this.recorder.record({ run_id: runId, event: "plan.generated", plan, plan_validation: planValidation });

    const risks = detectProjectRisks(plan);
    const riskDecision = summarizeRiskDecision(risks);
    await this.recorder.record({ run_id: runId, event: "risk.detected", risks, risk_decision: riskDecision });

    if (!planValidation.ok) {
      await this.recorder.record({
        run_id: runId,
        event: "plan.validation_failed",
        validation_errors: planValidation.errors,
        fallback: {
          status: "needs_clarification",
          missing_info: plan.missing_info
        }
      });
      await this.recorder.record({
        run_id: runId,
        event: "run.waiting_clarification",
        missing_info: plan.missing_info,
        failed_before_side_effects: true
      });
      return {
        runId,
        status: "needs_clarification",
        plan,
        plan_validation: planValidation,
        risks,
        risk_decision: riskDecision,
        artifacts: [],
        duplicate_guard: { enabled: false, status: "skipped", reason: "invalid_plan" }
      };
    }

    await this.recorder.record({
      run_id: runId,
      event: "confirmation.requested",
      confirmation: plan.confirmations[0]
    });

    const artifacts = [];
    const plannedTools = plannedToolsForRun({ autoConfirm, sendPlanCard, sendEntryMessage, pinEntryMessage, sendRiskCard });
    if (plannedTools.length > 0) {
      try {
        this.tools.preflight(plannedTools);
      } catch (error) {
        await this.recorder.record({
          run_id: runId,
          event: "run.failed",
          error: { message: error.message },
          failed_before_side_effects: true
        });
        throw error;
      }
    }

    const guardKey = buildProjectInitDedupeKey({
      inputText,
      plan,
      profile: this.profile,
      targets: this.feishuTargets,
      explicitKey: dedupeKey
    });
    const guardState = await this.startDuplicateGuard(runId, guardKey, plan, shouldGuardRun({ autoConfirm, sendPlanCard }));

    if (sendPlanCard) {
      try {
        artifacts.push(
          ...(await this.callTool(runId, 0, "step-confirm", "card.send", {
            title: "PilotFlow 项目飞行计划",
            card: buildFlightPlanCard({ runId, plan, confirmationText: "确认起飞" })
          }))
        );
      } catch (error) {
        await this.recorder.record({
          run_id: runId,
          event: "run.failed",
          error: { message: error.message },
          failed_before_side_effects: true
        });
        throw error;
      }
    }

    if (!autoConfirm) {
      await this.recorder.record({
        run_id: runId,
        event: "run.waiting_confirmation",
        expected_confirmation_text: "确认起飞",
        received_confirmation_text: confirmationText || null
      });
      return { runId, status: "waiting_confirmation", plan, risks, risk_decision: riskDecision, artifacts, duplicate_guard: guardState };
    }

    const approved = {
      ...plan.confirmations[0],
      status: "approved",
      approved_by: "demo-user",
      approved_at: new Date().toISOString(),
      confirmation_text: confirmationText || "auto-confirmed dry-run"
    };
    await this.recorder.record({ run_id: runId, event: "confirmation.approved", confirmation: approved });

    try {
      artifacts.push(
        ...(await this.callTool(runId, 1, "step-doc", "doc.create", {
          title: "PilotFlow Project Brief",
          markdown: buildBriefMarkdown(plan)
        }))
      );

      artifacts.push(
        ...(await this.callTool(runId, 2, "step-state", "base.write", {
          body: {
            fields: PROJECT_STATE_FIELDS,
            rows: buildProjectStateRows(plan, { runId, artifacts, risks })
          }
        }))
      );

      let taskAssignee = resolveTaskAssignee(plan, {
        ownerOpenIdMap,
        defaultOpenId: autoLookupOwnerContact ? "" : taskAssigneeOpenId
      });
      let sequence = 3;
      if (autoLookupOwnerContact && !taskAssignee.assignee) {
        taskAssignee = await this.lookupOwnerContact(runId, sequence, taskAssignee);
        sequence += 1;
        taskAssignee = applyDefaultTaskAssignee(taskAssignee, taskAssigneeOpenId);
      }

      artifacts.push(
        ...(await this.callTool(runId, sequence, "step-task", "task.create", {
          summary: firstTaskSummary(plan),
          description: buildTaskDescription({ runId, plan, taskAssignee }),
          due: normalizeDueDate(plan.deadline),
          owner: taskAssignee.owner,
          assignee: taskAssignee.assignee || undefined,
          assignee_source: taskAssignee.source
        }))
      );
      sequence += 1;

      if (sendRiskCard) {
        artifacts.push(
          ...(await this.callTool(runId, sequence, "step-risk", "card.send", {
            title: "PilotFlow 风险裁决卡",
            card: buildRiskDecisionCard({ runId, plan, risks, summary: riskDecision })
          }))
        );
      } else {
        await this.skipStep(runId, "step-risk", "risk decision card disabled");
      }
      sequence += 1;

      const shouldSendEntryMessage = sendEntryMessage || pinEntryMessage;
      let entryMessageArtifact;
      if (shouldSendEntryMessage) {
        const entryMessageText = buildProjectEntryMessageText({ runId, plan, artifacts });
        const entryArtifacts = await this.callTool(runId, sequence, "step-entry", "entry.send", {
          text: entryMessageText
        });
        artifacts.push(...entryArtifacts);
        entryMessageArtifact = entryArtifacts.find((artifact) => artifact.type === "entry_message");
      } else {
        await this.skipStep(runId, "step-entry", "entry message disabled");
      }
      sequence += 1;

      if (pinEntryMessage) {
        const messageId = entryMessageArtifact?.external_id || (entryMessageArtifact?.status === "planned" ? entryMessageArtifact.id : "");
        if (messageId) {
          artifacts.push(
            ...(await this.callTool(runId, sequence, "step-pin", "entry.pin", {
              title: "Pinned PilotFlow project entry",
              messageId
            }))
          );
        } else {
          await this.skipStep(runId, "step-pin", "entry message id unavailable");
        }
      } else {
        await this.skipStep(runId, "step-pin", "entry pin disabled");
      }
      sequence += 1;

      const summaryText = buildDeliverySummaryText({ runId, plan, artifacts });
      artifacts.push(
        ...(await this.callTool(runId, sequence, "step-summary", "im.send", {
          text: summaryText
        }))
      );
    } catch (error) {
      await this.duplicateGuard.mark({ key: guardState.key, runId, status: "failed", artifacts });
      await this.recorder.record({ run_id: runId, event: "run.failed", error: { message: error.message } });
      throw error;
    }

    const runLogArtifact = {
      id: `artifact-${runId}-log`,
      type: "run_log",
      title: "JSONL run log",
      status: "created"
    };
    artifacts.push(runLogArtifact);

    await this.recorder.record({
      run_id: runId,
      event: "artifact.created",
      artifact: runLogArtifact
    });
    await this.duplicateGuard.mark({ key: guardState.key, runId, status: "completed", artifacts });
    await this.recorder.record({ run_id: runId, event: "run.completed" });

    return { runId, status: "completed", plan, risks, risk_decision: riskDecision, artifacts, duplicate_guard: guardState };
  }

  async callTool(runId, sequence, stepId, tool, input) {
    const toolCallId = `tool-${sequence}`;
    await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "running" });
    await this.recorder.record({ run_id: runId, event: "tool.called", tool_call_id: toolCallId, tool, input });
    try {
      const output = await this.tools.execute(tool, input, { runId, sequence });
      await this.recorder.record({ run_id: runId, event: "tool.succeeded", tool_call_id: toolCallId, tool, output });
      const artifacts = normalizeFeishuArtifacts(tool, input, output, { runId, sequence });
      for (const artifact of artifacts) {
        await this.recorder.record({
          run_id: runId,
          event: artifact.status === "planned" ? "artifact.planned" : "artifact.created",
          tool_call_id: toolCallId,
          artifact
        });
      }
      await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "succeeded" });
      return artifacts;
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "tool.failed",
        tool_call_id: toolCallId,
        tool,
        error: {
          message: error.message,
          result: error.result
        }
      });
      await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "failed" });
      throw error;
    }
  }

  async lookupOwnerContact(runId, sequence, taskAssignee) {
    const owner = taskAssignee.owner;
    const toolCallId = `tool-${sequence}`;
    await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: "step-owner-lookup", status: "running" });
    await this.recorder.record({
      run_id: runId,
      event: "tool.called",
      tool_call_id: toolCallId,
      tool: "contact.search",
      input: { query: owner, pageSize: 5 }
    });

    try {
      const output = await this.tools.execute("contact.search", { query: owner, pageSize: 5 }, { runId, sequence });
      await this.recorder.record({ run_id: runId, event: "tool.succeeded", tool_call_id: toolCallId, tool: "contact.search", output });
      const resolved = resolveContactSearchAssignee(owner, output);
      await this.recorder.record({ run_id: runId, event: "owner.lookup_completed", owner, contact_lookup: resolved.contact_lookup });
      await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: "step-owner-lookup", status: "succeeded" });
      return resolved.assignee ? resolved : { ...taskAssignee, source: resolved.source, contact_lookup: resolved.contact_lookup };
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "tool.failed",
        tool_call_id: toolCallId,
        tool: "contact.search",
        error: {
          message: error.message,
          result: error.result
        }
      });
      await this.recorder.record({
        run_id: runId,
        event: "owner.lookup_failed",
        owner,
        error: { message: error.message }
      });
      await this.recorder.record({
        run_id: runId,
        event: "step.status_changed",
        step_id: "step-owner-lookup",
        status: "skipped",
        reason: "optional contact lookup failed"
      });
      return {
        ...taskAssignee,
        contact_lookup: {
          status: "failed",
          reason: error.message
        }
      };
    }
  }

  async skipStep(runId, stepId, reason) {
    await this.recorder.record({ run_id: runId, event: "step.status_changed", step_id: stepId, status: "skipped", reason });
  }

  async startDuplicateGuard(runId, key, plan, enabledForRun) {
    if (!enabledForRun) {
      const state = { enabled: false, key, status: "skipped", reason: "no_live_side_effects" };
      await this.recorder.record({ run_id: runId, event: "run.guard_skipped", duplicate_guard: state });
      return state;
    }

    try {
      const state = await this.duplicateGuard.start({
        key,
        runId,
        summary: duplicateGuardSummary({ plan, mode: this.mode, profile: this.profile })
      });
      await this.recorder.record({ run_id: runId, event: "run.guard_checked", duplicate_guard: state });
      return state;
    } catch (error) {
      await this.recorder.record({
        run_id: runId,
        event: "run.duplicate_blocked",
        duplicate_guard: {
          enabled: true,
          key,
          status: "blocked",
          existing_run: error.existingRun
        }
      });
      await this.recorder.record({
        run_id: runId,
        event: "run.failed",
        error: { message: error.message, code: error.code },
        failed_before_side_effects: true
      });
      throw error;
    }
  }
}

function toolsForRun({ sendEntryMessage, pinEntryMessage, sendRiskCard }) {
  return [
    ...SIDE_EFFECT_TOOLS,
    ...(sendEntryMessage || pinEntryMessage ? ["entry.send"] : []),
    ...(pinEntryMessage ? ["entry.pin"] : []),
    ...(sendRiskCard ? ["card.send"] : [])
  ];
}

function plannedToolsForRun({ autoConfirm, sendPlanCard, sendEntryMessage, pinEntryMessage, sendRiskCard }) {
  return [
    ...(sendPlanCard ? ["card.send"] : []),
    ...(autoConfirm ? toolsForRun({ sendEntryMessage, pinEntryMessage, sendRiskCard }) : [])
  ];
}

function shouldGuardRun({ autoConfirm, sendPlanCard }) {
  return autoConfirm || sendPlanCard;
}

function buildBriefMarkdown(plan) {
  return `# PilotFlow Project Brief

## Goal

${plan.goal}

## Members

${plan.members.map((member) => `- ${member}`).join("\n") || "- TBD"}

## Deliverables

${plan.deliverables.map((item) => `- ${item}`).join("\n") || "- TBD"}

## Deadline

${plan.deadline}

## Risks

${plan.risks.map((risk) => `- ${risk.title}`).join("\n") || "- No explicit risks"}
`;
}

function buildTaskDescription({ runId, plan, taskAssignee }) {
  const lines = [
    `Created by PilotFlow run ${runId}.`,
    "",
    `Goal: ${plan.goal}`,
    `Fallback owner: ${taskAssignee.owner}`
  ];

  if (taskAssignee.assignee) {
    lines.push(`Feishu assignee: ${taskAssignee.assignee} (${taskAssignee.source})`);
  } else {
    lines.push(`Feishu assignee: ${taskAssignee.source}; using text owner fallback.`);
  }

  return lines.join("\n");
}
