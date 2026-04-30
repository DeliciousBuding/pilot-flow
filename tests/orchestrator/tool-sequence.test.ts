import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProjectInitPlan } from "../../src/types/plan.js";
import type { Artifact } from "../../src/types/artifact.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../../src/types/tool.js";
import { MemoryRecorder } from "../helpers/memory-recorder.js";
import { buildToolSequence, executeToolSequence, preflightToolSequence } from "../../src/orchestrator/tool-sequence.js";
import { ToolRegistry } from "../../src/tools/registry.js";

describe("buildToolSequence", () => {
  it("builds the deterministic project-init sequence with optional entry, announcement, pin, and risk steps", () => {
    const sequence = buildToolSequence({
      runId: "run-test",
      plan: samplePlan(),
      risks: [],
      riskDecision: { total: 0, open: 0, highest_level: "low", recommended_action: "accept_with_followup", top_risks: [] },
      artifacts: [],
      options: {
        sendRiskCard: true,
        sendEntryMessage: true,
        updateAnnouncement: true,
        pinEntryMessage: true,
      },
    });

    assert.deepEqual(sequence.map((step) => `${step.id}:${step.tool}:${step.optional ? "optional" : "required"}`), [
      "step-doc:doc.create:required",
      "step-state:base.write:required",
      "step-task:task.create:required",
      "step-risk:card.send:required",
      "step-entry:entry.send:required",
      "step-announcement:announcement.update:optional",
      "step-pin:entry.pin:required",
      "step-summary:im.send:required",
    ]);
  });
});

describe("executeToolSequence", () => {
  it("continues after optional tool failure and records a failed fallback artifact", async () => {
    const recorder = new MemoryRecorder();
    const registry = new ToolRegistry();
    const called: string[] = [];

    for (const name of ["doc.create", "announcement.update", "im.send"]) {
      registry.register(fakeTool(name, async (_input, _ctx) => {
        called.push(name);
        if (name === "announcement.update") throw new Error("announcement blocked");
        return {
          success: true,
          artifact: { type: name === "doc.create" ? "doc" : "im_message", external_id: `${name}-1`, title: name },
        };
      }, name !== "announcement.update"));
    }

    const artifacts = await executeToolSequence({
      runId: "run-seq",
      registry,
      recorder,
      dryRun: false,
      confirmed: true,
      profile: "pilotflow-contest",
      targets: { chatId: "chat", baseToken: "base", baseTableId: "table" },
      sequence: [
        { id: "step-doc", tool: "doc.create", input: () => ({ title: "Brief", markdown: "body" }) },
        { id: "step-announcement", tool: "announcement.update", optional: true, input: () => ({ title: "Announcement", html: "<p>x</p>" }) },
        { id: "step-summary", tool: "im.send", input: () => ({ text: "done" }) },
      ],
    });

    assert.deepEqual(called, ["doc.create", "announcement.update", "im.send"]);
    assert.equal(artifacts.length, 3);
    assert.equal(artifacts[1]?.type, "announcement");
    assert.equal(artifacts[1]?.metadata?.status, "failed");
    assert.equal(recorder.ofType("optional_tool.fallback").length, 1);
    assert.equal(recorder.ofType("step.status_changed").at(-1)?.status, "succeeded");
  });

  it("fails required tools that return success false without throwing", async () => {
    const recorder = new MemoryRecorder();
    const registry = new ToolRegistry();
    registry.register(fakeTool("doc.create", async () => ({ success: false, error: "doc failed" })));

    await assert.rejects(
      () => executeToolSequence({
        runId: "run-false",
        registry,
        recorder,
        dryRun: false,
        confirmed: true,
        sequence: [{ id: "step-doc", tool: "doc.create", input: () => ({ title: "Brief", markdown: "body" }) }],
      }),
      /doc failed/u,
    );
    assert.equal(recorder.ofType("step.status_changed").at(-1)?.status, "failed");
  });

  it("preflight rejects unregistered tools before earlier writes can run", () => {
    const registry = new ToolRegistry();

    assert.throws(
      () => preflightToolSequence(registry, buildToolSequence({
        runId: "run-test",
        plan: samplePlan(),
        risks: [],
        riskDecision: { total: 0, open: 0, highest_level: "low", recommended_action: "accept_with_followup", top_risks: [] },
        artifacts: [],
        options: {},
      })),
      /Tool not registered/u,
    );
  });
});

function samplePlan(): ProjectInitPlan {
  return {
    intent: "project_init",
    goal: "Launch PilotFlow",
    members: ["Alice"],
    deliverables: ["Brief"],
    deadline: "2026-05-01",
    missing_info: [],
    steps: [],
    confirmations: [{ id: "confirm-takeoff", prompt: "Confirm", status: "pending", required_for: [] }],
    risks: [],
  };
}

function fakeTool(name: string, handler: ToolDefinition["handler"], confirmationRequired = true): ToolDefinition {
  return {
    name,
    description: name,
    confirmationRequired,
    requiresTargets: name === "doc.create" ? [] : ["chatId"],
    schema: {
      type: "function",
      function: {
        name: name.replaceAll(".", "_"),
        description: name,
        parameters: { type: "object", properties: {} },
      },
    },
    handler,
  };
}
