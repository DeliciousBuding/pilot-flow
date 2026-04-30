import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Recorder, RecorderEvent } from "../types/recorder.js";
import { redactObject } from "../safety/redact.js";

export class JsonlRecorder implements Recorder {
  constructor(private readonly filePath: string) {}

  async record(event: RecorderEvent): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const timestamp = new Date().toISOString();
      const line = JSON.stringify({
        ts: event.ts ?? timestamp,
        timestamp: event.timestamp ?? timestamp,
        ...redactObject(event),
      });
      await appendFile(this.filePath, `${line}\n`, "utf8");
    } catch (error) {
      console.error(`JsonlRecorder write failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  close(): void {
    // appendFile is awaited per event; no open handle is retained.
  }
}
