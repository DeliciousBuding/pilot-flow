import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunOptions } from "../../orchestrator/orchestrator.js";

export interface PendingRunRecord {
  readonly runId: string;
  readonly chatId?: string;
  readonly inputText: string;
  readonly options: PendingRunOptions;
  readonly createdAt: string;
}

export interface PendingRunOptions {
  readonly sendEntryMessage?: boolean;
  readonly pinEntryMessage?: boolean;
  readonly updateAnnouncement?: boolean;
  readonly sendRiskCard?: boolean;
  readonly autoLookupOwnerContact?: boolean;
  readonly ownerOpenIdMap?: Record<string, string>;
  readonly taskAssigneeOpenId?: string;
  readonly sourceMessage?: string;
}

interface PendingRunStoreState {
  readonly runs: readonly PendingRunRecord[];
}

export interface PendingRunStoreConfig {
  readonly storagePath: string;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

export class PendingRunStore {
  private readonly storagePath: string;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(config: PendingRunStoreConfig) {
    this.storagePath = config.storagePath;
    this.ttlMs = config.ttlMs ?? 24 * 60 * 60 * 1000;
    this.now = config.now ?? Date.now;
  }

  async save(record: PendingRunRecord): Promise<void> {
    const state = await this.readState();
    const runs = state.runs.filter((item) => item.runId !== record.runId);
    runs.push(record);
    await this.writeState({ runs });
  }

  async get(runId: string): Promise<PendingRunRecord | null> {
    const state = await this.readState();
    return state.runs.find((item) => item.runId === runId) ?? null;
  }

  async findLatestByChatId(chatId: string): Promise<PendingRunRecord | null> {
    const state = await this.readState();
    const matches = state.runs.filter((item) => item.chatId === chatId);
    if (matches.length === 0) return null;
    return matches
      .slice()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
  }

  async take(runId: string): Promise<PendingRunRecord | null> {
    const state = await this.readState();
    const match = state.runs.find((item) => item.runId === runId) ?? null;
    if (!match) return null;
    await this.writeState({ runs: state.runs.filter((item) => item.runId !== runId) });
    return match;
  }

  async delete(runId: string): Promise<void> {
    const state = await this.readState();
    if (!state.runs.some((item) => item.runId === runId)) return;
    await this.writeState({ runs: state.runs.filter((item) => item.runId !== runId) });
  }

  async list(): Promise<readonly PendingRunRecord[]> {
    const state = await this.readState();
    return state.runs;
  }

  async count(): Promise<number> {
    const state = await this.readState();
    return state.runs.length;
  }

  private async readState(): Promise<PendingRunStoreState> {
    const state = await this.readRawState();
    const threshold = this.now() - this.ttlMs;
    const runs = state.runs.filter((item) => Date.parse(item.createdAt) >= threshold);
    if (runs.length !== state.runs.length) await this.writeState({ runs });
    return { runs };
  }

  private async readRawState(): Promise<PendingRunStoreState> {
    try {
      const text = await readFile(this.storagePath, "utf8");
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { runs: [] };
      const runs = Array.isArray((parsed as { runs?: unknown }).runs) ? (parsed as { runs: PendingRunRecord[] }).runs : [];
      return { runs: runs.filter(isPendingRunRecord) };
    } catch {
      return { runs: [] };
    }
  }

  private async writeState(state: PendingRunStoreState): Promise<void> {
    await mkdir(dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, JSON.stringify(state, null, 2), "utf8");
  }
}

export function toPendingRunOptions(options: RunOptions): PendingRunOptions {
  return {
    sendEntryMessage: options.sendEntryMessage,
    pinEntryMessage: options.pinEntryMessage,
    updateAnnouncement: options.updateAnnouncement,
    sendRiskCard: options.sendRiskCard,
    autoLookupOwnerContact: options.autoLookupOwnerContact,
    ownerOpenIdMap: options.ownerOpenIdMap,
    taskAssigneeOpenId: options.taskAssigneeOpenId,
    sourceMessage: options.sourceMessage,
  };
}

function isPendingRunRecord(value: unknown): value is PendingRunRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.runId === "string" &&
    typeof record.inputText === "string" &&
    typeof record.createdAt === "string" &&
    (record.chatId === undefined || typeof record.chatId === "string") &&
    record.options !== null &&
    typeof record.options === "object" &&
    !Array.isArray(record.options);
}
