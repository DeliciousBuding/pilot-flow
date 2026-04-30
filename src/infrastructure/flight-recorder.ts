import { readFile } from "node:fs/promises";
import type { Artifact } from "../types/artifact.js";
import type { LegacyRecorderEvent, RecorderEvent, RunStatus } from "../types/recorder.js";

export interface FlightRecorderModel {
  readonly runId: string;
  readonly status: RunStatus;
  readonly events: readonly LegacyRecorderEvent[];
  readonly artifacts: readonly Artifact[];
  readonly duration?: number;
}

export async function buildFlightRecorderModel(jsonPath: string): Promise<FlightRecorderModel | null> {
  const events = await readJsonlSafe(jsonPath);
  if (events.length === 0) return null;

  return {
    runId: findRunId(events),
    status: deriveRunStatus(events),
    events,
    artifacts: events.flatMap(extractArtifacts),
    duration: deriveDuration(events),
  };
}

export async function readJsonlSafe(jsonPath: string): Promise<LegacyRecorderEvent[]> {
  const text = await readFile(jsonPath, "utf8");
  const events: LegacyRecorderEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") events.push(parsed as LegacyRecorderEvent);
    } catch {
      // Bad lines should not break the flight recorder view.
    }
  }
  return events;
}

function findRunId(events: readonly LegacyRecorderEvent[]): string {
  for (const event of events) {
    if (typeof event.runId === "string") return event.runId;
    if (typeof event.run_id === "string") return event.run_id;
  }
  return "unknown-run";
}

function deriveRunStatus(events: readonly LegacyRecorderEvent[]): RunStatus {
  if (events.some((event) => eventName(event) === "run.completed")) return "completed";
  if (events.some((event) => eventName(event) === "run.failed")) return "failed";
  if (events.some((event) => eventName(event) === "run.waiting_confirmation")) return "waiting_confirmation";
  return "running";
}

function eventName(event: LegacyRecorderEvent): string {
  return String(event.event ?? event.type ?? "");
}

function extractArtifacts(event: LegacyRecorderEvent): Artifact[] {
  const artifacts: Artifact[] = [];
  if (isArtifact(event.artifact)) artifacts.push(event.artifact);
  if (Array.isArray(event.artifacts)) {
    artifacts.push(...event.artifacts.filter(isArtifact));
  }
  return artifacts;
}

function isArtifact(value: unknown): value is Artifact {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Artifact).type === "string" &&
      typeof (value as Artifact).external_id === "string",
  );
}

function deriveDuration(events: readonly LegacyRecorderEvent[]): number | undefined {
  const times = events
    .map((event) => Date.parse(String(event.timestamp ?? event.ts ?? "")))
    .filter((time) => Number.isFinite(time));
  if (times.length < 2) return undefined;
  return Math.max(...times) - Math.min(...times);
}
