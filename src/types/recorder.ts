export type EventType =
  | "run.started"
  | "run.created"
  | "run.completed"
  | "run.failed"
  | "run.waiting_confirmation"
  | "plan.generated"
  | "plan.validated"
  | "confirmation.requested"
  | "confirmation.approved"
  | "confirmation.rejected"
  | "tool.called"
  | "tool.succeeded"
  | "tool.failed"
  | "artifact.created"
  | "artifact.failed"
  | "risk.detected"
  | "guard.started"
  | "guard.completed"
  | "guard.blocked"
  | "step.status_changed";

export interface RecorderEvent {
  readonly type: EventType | string;
  readonly runId: string;
  readonly sequence?: number;
  readonly timestamp?: string;
  readonly [key: string]: unknown;
}

export interface Recorder {
  record(event: RecorderEvent): Promise<void>;
  close(): void | Promise<void>;
}

export interface LegacyRecorderEvent {
  readonly type?: EventType | string;
  readonly event?: EventType | string;
  readonly runId?: string;
  readonly run_id?: string;
  readonly sequence?: number;
  readonly timestamp?: string;
  readonly ts?: string;
  readonly [key: string]: unknown;
}

export type RunStatus =
  | "pending"
  | "running"
  | "waiting_confirmation"
  | "needs_clarification"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";
