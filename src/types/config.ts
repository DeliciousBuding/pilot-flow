import type { FeishuTargets } from "./feishu.js";

export type RunMode = "dry-run" | "live";

export interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fallbackModels?: readonly string[];
  readonly maxTokens?: number;
  readonly temperature?: number;
}

export interface RuntimeConfig {
  readonly mode: RunMode;
  readonly profile: string;
  readonly feishuTargets: FeishuTargets;
  readonly duplicateGuard: DuplicateGuardConfig;
  readonly llm?: LlmConfig;
  readonly autoConfirm: boolean;
  readonly verbose: boolean;
}

export interface DuplicateGuardConfig {
  readonly enabled: boolean;
  readonly storagePath: string;
  readonly ttlMs: number;
  readonly allowDuplicateRun: boolean;
}
