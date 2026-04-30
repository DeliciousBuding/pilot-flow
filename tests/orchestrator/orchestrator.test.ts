import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectInitPlan } from "../../src/types/plan.js";
import type { ToolDefinition } from "../../src/types/tool.js";
import { MemoryRecorder } from "../helpers/memory-recorder.js";
import { Orchestrator } from "../../src/orchestrator/orchestrator.js";
import { TextConfirmationGate } from "../../src/orchestrator/confirmation-gate.js";
import { DuplicateGuard } from "../../src/orchestrator/duplicate-guard.js";
import { ToolRegistry } from "../../src/tools/registry.js";

describe("Orchestrator", () => {
  it("falls back to clarification before any side effects when planner output is invalid", async () => {
    const harness = await createHarness({ plannerOutput: { intent: "broken" } });
    try {
      const result = await harness.orchestrator.run("broken request", { autoConfirm: true });

      assert.equal(result.status, "needs_clarification");
      assert.equal(harness.called.length, 0);
      assert.equal(harness.recorder.ofType("plan.validation_failed").length, 1);
      assert.equal(harness.recorder.ofType("tool.called").length, 0);
    } finally {
      await harness.cleanup();
    }
  });

  it("waits for explicit live confirmation and does not execute side-effect tools", async () => {
    const harness = await createHarness({ mode: "live" });
    try {
      const result = await harness.orchestrator.run("launch", { autoConfirm: true, confirmationText: "" });

      assert.equal(result.status, "waiting_confirmation");
      assert.equal(harness.called.length, 0);
      assert.equal(harness.recorder.ofType("run.waiting_confirmation").length, 1);
    } finally {
      await harness.cleanup();
    }
  });

  it("can send only the plan card before waiting for live confirmation", async () => {
    const harness = await createHarness({ mode: "live" });
    try {
      const result = await harness.orchestrator.run("launch", { autoConfirm: false, sendPlanCard: true, dedupeKey: "project_init:card-then-run" });

      assert.equal(result.status, "waiting_confirmation");
      assert.deepEqual(harness.called, ["card.send"]);
      assert.equal(result.artifacts[0]?.type, "card");

      const completed = await harness.orchestrator.run("launch", {
        autoConfirm: true,
        confirmationText: "确认执行",
        dedupeKey: "project_init:card-then-run",
      });
      assert.equal(completed.status, "completed");
    } finally {
      await harness.cleanup();
    }
  });

  it("fails live batch preflight before any side-effect tool when required targets are missing", async () => {
    const harness = await createHarness({ mode: "live", targets: { chatId: "chat" } });
    try {
      await assert.rejects(
        () => harness.orchestrator.run("launch", { autoConfirm: true, confirmationText: "确认执行" }),
        /Missing required Feishu targets before side effects/u,
      );
      assert.equal(harness.called.length, 0);
      assert.equal(harness.recorder.ofType("tool.called").length, 0);
    } finally {
      await harness.cleanup();
    }
  });

  it("executes live tools only after confirmation and passes confirmed context to the registry", async () => {
    const harness = await createHarness({ mode: "live" });
    try {
      const result = await harness.orchestrator.run("launch", {
        autoConfirm: true,
        confirmationText: "确认执行",
        sendEntryMessage: true,
        sendRiskCard: true,
      });

      assert.equal(result.status, "completed");
      assert.equal(harness.called.length, 6);
      assert.ok(harness.contexts.every((ctx) => ctx.confirmed === true));
      assert.ok(result.artifacts.some((artifact) => artifact.type === "doc"));
      assert.equal(harness.recorder.ofType("run.completed").length, 1);
    } finally {
      await harness.cleanup();
    }
  });

  it("passes sourceMessage into Project State rows", async () => {
    const harness = await createHarness({ mode: "live" });
    try {
      await harness.orchestrator.run("launch", {
        autoConfirm: true,
        confirmationText: "确认执行",
        sourceMessage: "source-message-1",
      });

      assert.equal(harness.baseRows.flat().includes("source-message-1"), true);
    } finally {
      await harness.cleanup();
    }
  });

  it("starts duplicate guard before Feishu writes and blocks the second confirmed live run", async () => {
    const harness = await createHarness({ mode: "live" });
    try {
      await harness.orchestrator.run("launch", { autoConfirm: true, confirmationText: "确认执行", dedupeKey: "project_init:fixed" });

      await assert.rejects(
        () => harness.orchestrator.run("launch", { autoConfirm: true, confirmationText: "确认执行", dedupeKey: "project_init:fixed" }),
        /Duplicate live run blocked/u,
      );
      assert.equal(harness.called.filter((name) => name === "doc.create").length, 1);
    } finally {
      await harness.cleanup();
    }
  });
});

async function createHarness({
  mode = "dry-run",
  plannerOutput = samplePlan(),
  targets = { chatId: "chat", baseToken: "base", baseTableId: "table" },
}: {
  readonly mode?: "dry-run" | "live";
  readonly plannerOutput?: unknown;
  readonly targets?: Record<string, string>;
} = {}) {
  const dir = join(process.cwd(), "tmp", "tests", `pilotflow-orchestrator-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const recorder = new MemoryRecorder();
  const registry = new ToolRegistry();
  const called: string[] = [];
  const contexts: Array<{ readonly confirmed?: boolean }> = [];
  const baseRows: unknown[][] = [];

  for (const name of ["doc.create", "base.write", "task.create", "card.send", "entry.send", "im.send"]) {
    registry.register(fakeTool(name, async (input, ctx) => {
      called.push(name);
      contexts.push({ confirmed: ctx.confirmed });
      if (name === "base.write") {
        const body = input.body as { readonly rows?: readonly (readonly string[])[] } | undefined;
        baseRows.push(...(body?.rows?.map((row) => [...row]) ?? []));
      }
      return {
        success: true,
        artifact: {
          type: artifactType(name),
          external_id: `${name}-artifact`,
          title: name,
          metadata: { status: ctx.dryRun ? "planned" : "created" },
        },
      };
    }));
  }

  const orchestrator = new Orchestrator({
    planner: { plan: () => plannerOutput as ProjectInitPlan },
    registry,
    recorder,
    confirmationGate: new TextConfirmationGate(),
    duplicateGuard: new DuplicateGuard({ enabled: true, storagePath: join(dir, "guard"), ttlMs: 60_000, allowDuplicateRun: false }),
    runtime: {
      mode,
      profile: "pilotflow-contest",
      feishuTargets: targets,
      duplicateGuard: { enabled: true, storagePath: join(dir, "guard"), ttlMs: 60_000, allowDuplicateRun: false },
      autoConfirm: true,
      verbose: false,
    },
  });

  return {
    orchestrator,
    recorder,
    called,
    contexts,
    baseRows,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

function samplePlan(): ProjectInitPlan {
  return {
    intent: "project_init",
    goal: "Launch PilotFlow",
    members: ["Alice"],
    deliverables: ["Brief"],
    deadline: "2026-05-01",
    missing_info: [],
    steps: [],
    confirmations: [{ id: "confirm-execute", prompt: "Confirm", status: "pending", required_for: [] }],
    risks: [],
  };
}

function fakeTool(name: string, handler: ToolDefinition["handler"]): ToolDefinition {
  return {
    name,
    description: name,
    confirmationRequired: true,
    requiresTargets: name === "base.write" ? ["baseToken", "baseTableId"] : name === "doc.create" ? [] : ["chatId"],
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

function artifactType(name: string) {
  if (name === "doc.create") return "doc";
  if (name === "base.write") return "base_record";
  if (name === "task.create") return "task";
  if (name === "entry.send") return "entry_message";
  if (name === "card.send") return "card";
  return "im_message";
}
