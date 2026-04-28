import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

export class JsonlRecorder {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async record(event) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      ...event
    });
    await appendFile(this.filePath, `${line}\n`, "utf8");
  }
}
