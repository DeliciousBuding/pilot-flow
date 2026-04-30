import { createHash } from "node:crypto";
import { mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertPathSafe } from "../safety/write-guard.js";
import { buildDedupeKey } from "../shared/id.js";
import { PilotFlowError } from "../shared/errors.js";
import type { DuplicateGuardConfig } from "../types/config.js";
import type { ProjectInitPlan } from "../types/plan.js";

export interface GuardRun {
  readonly key: string;
  readonly runId: string;
  readonly status: "started" | "completed" | "failed";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly summary?: Record<string, unknown>;
  readonly artifactCount?: number;
}

export interface GuardState {
  readonly enabled: boolean;
  readonly key: string;
  readonly status: "skipped" | "bypassed" | "started";
  readonly reason?: string;
  readonly filePath?: string;
}

export class GuardBlockedError extends PilotFlowError {
  constructor(
    public readonly key: string,
    public readonly existingRun: GuardRun,
  ) {
    super(
      `Duplicate live run blocked for key ${key}. Existing ${existingRun.status} run: ${existingRun.runId}. Use --allow-duplicate-run only when intentional.`,
      "DUPLICATE_RUN_BLOCKED",
      { key, existingRun },
    );
    this.name = "GuardBlockedError";
  }
}

export class DuplicateGuard {
  private readonly enabled: boolean;
  private readonly storagePath: string;
  private readonly ttlMs: number;
  private readonly allowDuplicateRun: boolean;

  constructor(config: Partial<DuplicateGuardConfig> = {}) {
    this.enabled = config.enabled ?? false;
    this.storagePath = resolve(config.storagePath ?? "tmp/run-guard");
    this.ttlMs = config.ttlMs ?? 24 * 60 * 60 * 1000;
    this.allowDuplicateRun = config.allowDuplicateRun ?? false;
    assertPathSafe(this.storagePath);
  }

  async start({ key, runId, summary = {} }: { readonly key: string; readonly runId: string; readonly summary?: Record<string, unknown> }): Promise<GuardState> {
    if (!this.enabled) return { enabled: false, key, status: "skipped", reason: "disabled" };
    if (this.allowDuplicateRun) return { enabled: true, key, status: "bypassed", reason: "allow_duplicate_run" };

    await mkdir(this.storagePath, { recursive: true });
    const filePath = this.filePathForKey(key);
    const now = new Date().toISOString();
    const run: GuardRun = { key, runId, status: "started", createdAt: now, updatedAt: now, summary };

    try {
      const handle = await open(filePath, "wx");
      try {
        await handle.writeFile(`${JSON.stringify(run, null, 2)}\n`, "utf8");
      } finally {
        await handle.close();
      }
      return { enabled: true, key, status: "started", filePath };
    } catch (error) {
      if (!isFileExists(error)) throw error;
      const existing = await this.readRun(filePath);
      if (this.isExpired(existing)) {
        await rm(filePath, { force: true });
        return this.start({ key, runId, summary });
      }
      throw new GuardBlockedError(key, existing);
    }
  }

  async complete({ key, runId, artifactCount = 0 }: { readonly key: string; readonly runId: string; readonly artifactCount?: number }): Promise<void> {
    await this.mark({ key, runId, status: "completed", artifactCount });
  }

  async fail({ key, runId, artifactCount = 0 }: { readonly key: string; readonly runId: string; readonly artifactCount?: number }): Promise<void> {
    await this.mark({ key, runId, status: "failed", artifactCount });
  }

  async cleanup(): Promise<number> {
    if (!this.enabled || this.allowDuplicateRun) return 0;
    await mkdir(this.storagePath, { recursive: true });
    const entries = await readdir(this.storagePath, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = join(this.storagePath, entry.name);
      const run = await this.readRunOptional(filePath);
      if (run && this.isExpired(run)) {
        await rm(filePath, { force: true });
        removed += 1;
      }
    }
    return removed;
  }

  private async mark({ key, runId, status, artifactCount }: { readonly key: string; readonly runId: string; readonly status: GuardRun["status"]; readonly artifactCount: number }): Promise<void> {
    if (!this.enabled || this.allowDuplicateRun || !key) return;
    const filePath = this.filePathForKey(key);
    const existing = await this.readRunOptional(filePath);
    if (!existing) return;
    if (existing.runId !== runId) return;
    await writeFile(filePath, `${JSON.stringify({ ...existing, status, artifactCount, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  }

  private filePathForKey(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex").slice(0, 32);
    const filePath = join(this.storagePath, `${digest}.json`);
    assertPathSafe(filePath, this.storagePath);
    return filePath;
  }

  private async readRun(filePath: string): Promise<GuardRun> {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<GuardRun>;
    return {
      key: String(parsed.key ?? ""),
      runId: String(parsed.runId ?? ""),
      status: parsed.status === "completed" || parsed.status === "failed" ? parsed.status : "started",
      createdAt: String(parsed.createdAt ?? new Date(0).toISOString()),
      updatedAt: String(parsed.updatedAt ?? parsed.createdAt ?? new Date(0).toISOString()),
      summary: parsed.summary,
      artifactCount: parsed.artifactCount,
    };
  }

  private async readRunOptional(filePath: string): Promise<GuardRun | undefined> {
    try {
      return await this.readRun(filePath);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private isExpired(run: GuardRun): boolean {
    return Date.now() - Date.parse(run.updatedAt || run.createdAt) > this.ttlMs;
  }
}

export function buildProjectInitDedupeKey({ plan, scope = {}, explicitKey = "" }: { readonly plan: ProjectInitPlan; readonly scope?: Record<string, unknown>; readonly explicitKey?: string }): string {
  return explicitKey || buildDedupeKey(plan, scope);
}

export function duplicateGuardSummary({ plan, mode, profile }: { readonly plan: ProjectInitPlan; readonly mode: string; readonly profile: string }): Record<string, unknown> {
  return { intent: plan.intent, mode, profile, goal: plan.goal, deadline: plan.deadline };
}

function isFileExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "EEXIST";
}
