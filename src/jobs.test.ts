import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { config } from "./config.ts";
import { type Job, getJobsJson, saveJob } from "./jobs.ts";

function withTestEnvironment(run: (rootDir: string) => void): void {
  const rootDir = mkdtempSync(join(tmpdir(), "jobs-json-"));
  const originalHome = process.env.HOME;
  const originalJobsDir = config.jobsDir;

  process.env.HOME = rootDir;
  config.jobsDir = join(rootDir, ".codex-agent", "jobs");
  mkdirSync(config.jobsDir, { recursive: true });

  try {
    run(rootDir);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    config.jobsDir = originalJobsDir;
    rmSync(rootDir, { recursive: true, force: true });
  }
}

function createJob(overrides: Partial<Job>): Job {
  const base: Job = {
    id: "job-id",
    status: "pending",
    prompt: "Test prompt",
    model: "gpt-5.3-codex",
    reasoningEffort: "high",
    sandbox: "workspace-write",
    cwd: "/tmp",
    createdAt: "2026-02-13T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

describe("getJobsJson session metadata", () => {
  it("populates metadata for completed jobs and keeps running/pending null", () => {
    withTestEnvironment((rootDir) => {
      const sessionId = "01234567-89ab-cdef-0123-456789abcdef";
      const sessionsDir = join(rootDir, ".codex", "sessions", "2026", "02", "13");
      mkdirSync(sessionsDir, { recursive: true });

      const sessionPath = join(sessionsDir, `session-${sessionId}.jsonl`);
      const sessionRecords = [
        {
          type: "event_msg",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 123,
                output_tokens: 45,
              },
              model_context_window: 200000,
            },
          },
        },
        {
          type: "response_item",
          payload: {
            type: "custom_tool_call",
            name: "apply_patch",
            input:
              "*** Begin Patch\n*** Update File: src/jobs.ts\n+// example\n*** End Patch\n",
          },
        },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Implemented Story 4." }],
          },
        },
      ];
      writeFileSync(
        sessionPath,
        `${sessionRecords.map((record) => JSON.stringify(record)).join("\n")}\n`
      );

      saveJob(
        createJob({
          id: "job-completed",
          status: "completed",
          createdAt: "2026-02-13T01:00:00.000Z",
          startedAt: "2026-02-13T01:00:05.000Z",
          completedAt: "2026-02-13T01:01:05.000Z",
          result: `Agent finished. session id: ${sessionId}`,
        })
      );
      saveJob(
        createJob({
          id: "job-running",
          status: "running",
          createdAt: "2026-02-13T01:10:00.000Z",
        })
      );
      saveJob(
        createJob({
          id: "job-pending",
          status: "pending",
          createdAt: "2026-02-13T01:20:00.000Z",
        })
      );

      const output = getJobsJson();
      const byId = new Map(output.jobs.map((job) => [job.id, job]));

      const completed = byId.get("job-completed");
      expect(completed).toBeDefined();
      expect(completed?.tokens).toEqual({
        input: 123,
        output: 45,
        context_window: 200000,
        context_used_pct: 0.06,
      });
      expect(completed?.files_modified).toEqual(["src/jobs.ts"]);
      expect(completed?.summary).toBe("Implemented Story 4.");

      const running = byId.get("job-running");
      expect(running).toBeDefined();
      expect(running?.tokens).toBeNull();
      expect(running?.files_modified).toBeNull();
      expect(running?.summary).toBeNull();

      const pending = byId.get("job-pending");
      expect(pending).toBeDefined();
      expect(pending?.tokens).toBeNull();
      expect(pending?.files_modified).toBeNull();
      expect(pending?.summary).toBeNull();
    });
  });

  it("keeps metadata null when session file is missing", () => {
    withTestEnvironment(() => {
      saveJob(
        createJob({
          id: "job-missing-session",
          status: "completed",
          createdAt: "2026-02-13T02:00:00.000Z",
          startedAt: "2026-02-13T02:00:05.000Z",
          completedAt: "2026-02-13T02:01:05.000Z",
          result: "session id: deadbeef-dead-beef-dead-beefdeadbeef",
        })
      );

      const output = getJobsJson();
      const job = output.jobs.find((entry) => entry.id === "job-missing-session");
      expect(job).toBeDefined();
      expect(job?.tokens).toBeNull();
      expect(job?.files_modified).toBeNull();
      expect(job?.summary).toBeNull();
    });
  });

  it("keeps metadata null when session file is unparseable", () => {
    withTestEnvironment((rootDir) => {
      const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const sessionsDir = join(rootDir, ".codex", "sessions");
      mkdirSync(sessionsDir, { recursive: true });
      writeFileSync(join(sessionsDir, `session-${sessionId}.jsonl`), "not-json\n");

      saveJob(
        createJob({
          id: "job-bad-session",
          status: "completed",
          createdAt: "2026-02-13T03:00:00.000Z",
          startedAt: "2026-02-13T03:00:05.000Z",
          completedAt: "2026-02-13T03:01:05.000Z",
          result: `session id: ${sessionId}`,
        })
      );

      const output = getJobsJson();
      const job = output.jobs.find((entry) => entry.id === "job-bad-session");
      expect(job).toBeDefined();
      expect(job?.tokens).toBeNull();
      expect(job?.files_modified).toBeNull();
      expect(job?.summary).toBeNull();
    });
  });
});
