// File-based JSONL communication for agent monitoring

import {
  mkdirSync,
  readFileSync,
  appendFileSync,
  existsSync,
  watch,
  openSync,
  readSync,
  closeSync,
  statSync,
} from "fs";
import { join } from "path";

const COMMS_DIR = "/tmp/codex-agent";

export type CommsMessage =
  | { type: "status"; ts: string; msg: string }
  | { type: "finding"; ts: string; msg: string }
  | { type: "done"; ts: string; summary: string; resultFile?: string };

export function getCommsPath(jobId: string): string {
  return join(COMMS_DIR, `${jobId}.jsonl`);
}

export function ensureCommsDir(): void {
  mkdirSync(COMMS_DIR, { recursive: true });
}

export function writeComms(jobId: string, msg: CommsMessage): void {
  ensureCommsDir();
  appendFileSync(getCommsPath(jobId), JSON.stringify(msg) + "\n");
}

function ts(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function writeStatus(jobId: string, msg: string): void {
  writeComms(jobId, { type: "status", ts: ts(), msg });
}

export function writeFinding(jobId: string, msg: string): void {
  writeComms(jobId, { type: "finding", ts: ts(), msg });
}

export function writeDone(jobId: string, summary: string, resultFile?: string): void {
  const msg: CommsMessage = { type: "done", ts: ts(), summary };
  if (resultFile !== undefined) {
    msg.resultFile = resultFile;
  }
  writeComms(jobId, msg);
}

export function readCommsFile(jobId: string): CommsMessage[] {
  const filePath = getCommsPath(jobId);
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        try {
          return JSON.parse(line) as CommsMessage;
        } catch {
          return null;
        }
      })
      .filter((msg): msg is CommsMessage => msg !== null);
  } catch {
    return [];
  }
}

export function getLatestActivity(jobId: string): Date | null {
  const messages = readCommsFile(jobId);
  let latest: Date | null = null;

  for (const msg of messages) {
    const date = new Date(msg.ts);
    if (!latest || date.getTime() > latest.getTime()) {
      latest = date;
    }
  }

  return latest;
}

export function isAgentStuck(jobId: string, thresholdMinutes: number = 10): boolean {
  const filePath = getCommsPath(jobId);
  if (!existsSync(filePath)) return false;

  const latest = getLatestActivity(jobId);
  if (!latest) return false;

  return Date.now() - latest.getTime() > thresholdMinutes * 60 * 1000;
}

export function watchCommsFile(
  jobId: string,
  callback: (messages: CommsMessage[]) => void
): { stop: () => void } {
  const filePath = getCommsPath(jobId);
  let byteOffset = 0;
  let partialLine = "";
  let fileWatcher: ReturnType<typeof watch> | null = null;
  let dirWatcher: ReturnType<typeof watch> | null = null;
  let stopped = false;

  function readNewData(): void {
    if (stopped) return;
    if (!existsSync(filePath)) return;

    let fileSize: number;
    try {
      fileSize = statSync(filePath).size;
    } catch {
      return;
    }

    if (fileSize < byteOffset) {
      // File was truncated/reset — start reading from the beginning
      byteOffset = 0;
      partialLine = "";
    } else if (fileSize === byteOffset) {
      return;
    }

    const bytesToRead = fileSize - byteOffset;
    const buffer = Buffer.alloc(bytesToRead);

    let fd: number;
    try {
      fd = openSync(filePath, "r");
    } catch {
      return;
    }

    try {
      readSync(fd, buffer, 0, bytesToRead, byteOffset);
    } finally {
      closeSync(fd);
    }

    byteOffset = fileSize;

    const chunk = buffer.toString("utf-8");
    const combined = partialLine + chunk;
    const lines = combined.split("\n");

    // Last element may be incomplete if file didn't end with newline
    partialLine = lines.pop() ?? "";

    const messages: CommsMessage[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      try {
        messages.push(JSON.parse(trimmed) as CommsMessage);
      } catch {
        // Skip malformed lines
      }
    }

    if (messages.length > 0) {
      callback(messages);
    }
  }

  function startFileWatch(): void {
    if (stopped) return;
    try {
      fileWatcher = watch(filePath, () => {
        readNewData();
      });
    } catch {
      // File may have been removed; silently ignore
    }
  }

  function stop(): void {
    stopped = true;
    if (fileWatcher) {
      fileWatcher.close();
      fileWatcher = null;
    }
    if (dirWatcher) {
      dirWatcher.close();
      dirWatcher = null;
    }
  }

  if (existsSync(filePath)) {
    // File already exists — start watching it directly
    readNewData();
    startFileWatch();
  } else {
    // File doesn't exist yet — watch the directory for its creation
    ensureCommsDir();
    const fileName = `${jobId}.jsonl`;

    dirWatcher = watch(COMMS_DIR, (eventType, changedFile) => {
      if (stopped) return;
      if (changedFile === fileName && existsSync(filePath)) {
        // File appeared — stop directory watcher, switch to file watcher
        if (dirWatcher) {
          dirWatcher.close();
          dirWatcher = null;
        }
        readNewData();
        startFileWatch();
      }
    });
  }

  return { stop };
}
