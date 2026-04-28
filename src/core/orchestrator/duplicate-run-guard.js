import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const DEFAULT_DUPLICATE_GUARD_PATH = "tmp/run-guard/project-init-runs.json";

export class DuplicateRunGuard {
  constructor({ filePath = DEFAULT_DUPLICATE_GUARD_PATH, enabled = false, allowDuplicate = false } = {}) {
    this.filePath = resolve(filePath);
    this.enabled = enabled;
    this.allowDuplicate = allowDuplicate;
  }

  async start({ key, runId, summary = {} }) {
    if (!this.enabled) {
      return { enabled: false, key, status: "skipped", reason: "disabled" };
    }

    if (this.allowDuplicate) {
      return { enabled: true, key, status: "bypassed", reason: "allow_duplicate_run" };
    }

    const store = await readStore(this.filePath);
    const existing = store.runs[key];
    if (existing) {
      const error = new Error(
        `Duplicate live run blocked for key ${key}. Existing ${existing.status} run: ${existing.run_id}. ` +
          "Use --allow-duplicate-run only when a repeated Feishu write is intentional."
      );
      error.code = "DUPLICATE_RUN_BLOCKED";
      error.key = key;
      error.existingRun = existing;
      throw error;
    }

    const now = new Date().toISOString();
    const entry = {
      key,
      run_id: runId,
      status: "started",
      first_seen_at: now,
      updated_at: now,
      summary
    };

    store.runs[key] = entry;
    await writeStore(this.filePath, store);
    return { enabled: true, key, status: "started", file_path: this.filePath };
  }

  async mark({ key, runId, status, artifacts = [] }) {
    if (!this.enabled || this.allowDuplicate || !key) return;

    const store = await readStore(this.filePath);
    const existing = store.runs[key];
    if (!existing || existing.run_id !== runId) return;

    store.runs[key] = {
      ...existing,
      status,
      updated_at: new Date().toISOString(),
      artifact_count: artifacts.length
    };
    await writeStore(this.filePath, store);
  }
}

export function buildProjectInitDedupeKey({ inputText = "", plan, profile = "", targets = {}, explicitKey = "" }) {
  if (explicitKey) return explicitKey;

  const payload = {
    intent: "project_init",
    input: normalizeText(inputText),
    goal: plan.goal,
    deadline: plan.deadline,
    deliverables: plan.deliverables,
    profile,
    target_hash: hashValue({
      chatId: targets.chatId,
      baseToken: targets.baseToken,
      baseTableId: targets.baseTableId,
      tasklistId: targets.tasklistId
    }).slice(0, 16)
  };

  return `project_init:${hashValue(payload).slice(0, 24)}`;
}

export function duplicateGuardSummary({ plan, mode, profile }) {
  return {
    intent: "project_init",
    mode,
    profile,
    goal: plan.goal,
    deadline: plan.deadline
  };
}

async function readStore(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    return {
      version: 1,
      runs: parsed.runs && typeof parsed.runs === "object" ? parsed.runs : {}
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { version: 1, runs: {} };
  }
}

async function writeStore(filePath, store) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function hashValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
