export type ArtifactType =
  | "doc"
  | "base"
  | "base_record"
  | "task"
  | "im_message"
  | "message"
  | "entry_message"
  | "pinned_message"
  | "card"
  | "announcement";

export interface Artifact {
  readonly type: ArtifactType;
  readonly external_id: string;
  readonly url?: string;
  readonly title?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RawArtifact {
  readonly type?: string;
  readonly document_id?: string;
  readonly base_id?: string;
  readonly task_id?: string;
  readonly message_id?: string;
  readonly url?: string;
  readonly title?: string;
  readonly [key: string]: unknown;
}
