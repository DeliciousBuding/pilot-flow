import type { Recorder, RecorderEvent } from "../../src/types/recorder.js";

export class MemoryRecorder implements Recorder {
  public readonly events: RecorderEvent[] = [];

  async record(event: RecorderEvent): Promise<void> {
    this.events.push({ timestamp: event.timestamp ?? new Date().toISOString(), ...event });
  }

  close(): void {
    this.events.length = 0;
  }

  ofType(type: string): readonly RecorderEvent[] {
    return this.events.filter((event) => event.type === type);
  }
}
