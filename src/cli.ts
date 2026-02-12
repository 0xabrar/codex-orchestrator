#!/usr/bin/env bun

// Codex Agent CLI - Delegate tasks to GPT Codex agents with tmux integration
// Designed for Claude Code orchestration with bidirectional communication

import { config, ReasoningEffort, SandboxMode } from "./config.ts";
import {
  startJob,
  loadJob,
  listJobs,
  killJob,
  refreshJobStatus,
  cleanupOldJobs,
  deleteJob,
  sendToJob,
  getJobOutput,
  getJobFullOutput,
  getAttachCommand,
  Job,
  getJobsJson,
} from "./jobs.ts";
import { loadFiles, formatPromptWithFiles, estimateTokens } from "./files.ts";
import { isTmuxAvailable, listSessions, sessionExists, capturePane } from "./tmux.ts";
import { writeStatus, writeFinding, writeDone, readCommsFile } from "./comms.ts";

const HELP = `
Codex Agent - Delegate tasks to GPT Codex agents (tmux-based)

Usage:
  codex-agent start "prompt" [options]   Start agent in tmux session
  codex-agent status <jobId>             Check job status
  codex-agent send <jobId> "message"     Send message to running agent
  codex-agent capture <jobId> [lines]    Capture recent tmux output (default: 50 lines)
  codex-agent capture <jobId> --comms    Show formatted comms messages instead
  codex-agent output <jobId>             Get full session output
  codex-agent attach <jobId>             Get tmux attach command
  codex-agent watch <jobId>              Stream output updates
  codex-agent watch-comms <jobId>          Watch agent comms in real-time
  codex-agent monitor <jobId>              Block and watch agent until completion
  codex-agent jobs [--json]              List all jobs
  codex-agent sessions                   List active tmux sessions
  codex-agent kill <jobId>               Kill running job
  codex-agent clean                      Clean old completed jobs
  codex-agent health                     Check tmux and codex availability
  codex-agent comms <type> <jobId> [msg] Write a comms update (used by agents)

Options:
  -r, --reasoning <level>    Reasoning effort: low, medium, high, xhigh (default: high)
  -m, --model <model>        Model name (default: gpt-5.3-codex)
  -s, --sandbox <mode>       Sandbox: workspace-write, danger-full-access
  -f, --file <glob>          Include files matching glob (can repeat)
  -d, --dir <path>           Working directory (default: cwd)
  --type <type>              Agent type: research, implementation, review, test (default: implementation)
  --parent-session <id>      Parent session ID for linkage
  --dry-run                  Show prompt without executing
  --comms                    Show comms messages instead of tmux output (capture only)
  --strip-ansi               Remove ANSI escape codes from output (for capture/output)
  --json                     Output JSON (jobs command only)
  --limit <n>                Limit jobs shown (jobs command only)
  --all                      Show all jobs (jobs command only)
  -h, --help                 Show this help

Examples:
  # Start an agent
  codex-agent start "Review this code for security issues" -f "src/**/*.ts"

  # Check on it
  codex-agent capture abc123

  # Send additional context
  codex-agent send abc123 "Also check the auth module"

  # Attach to watch interactively
  tmux attach -t codex-agent-abc123

  # Or use the attach command
  codex-agent attach abc123

Bidirectional Communication:
  - Use 'send' to give agents additional instructions mid-task
  - Use 'capture' to see recent output programmatically
  - Use 'attach' to interact directly in tmux
  - Press Ctrl+C in tmux to interrupt, type to continue conversation
`;

interface Options {
  reasoning: ReasoningEffort;
  model: string;
  sandbox: SandboxMode;
  files: string[];
  dir: string;
  parentSessionId: string | null;
  dryRun: boolean;
  comms: boolean;
  stripAnsi: boolean;
  json: boolean;
  jobsLimit: number | null;
  jobsAll: boolean;
  agentType: string;
}

function stripAnsiCodes(text: string): string {
  return text
    // Remove ANSI escape sequences (colors, cursor movements, etc)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove other escape sequences (OSC, etc)
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // Remove carriage returns (used for spinner overwrites)
    .replace(/\r/g, '')
    // Remove other control characters except newline and tab
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function parseArgs(args: string[]): {
  command: string;
  positional: string[];
  options: Options;
} {
  const options: Options = {
    reasoning: config.defaultReasoningEffort,
    model: config.model,
    sandbox: config.defaultSandbox,
    files: [],
    dir: process.cwd(),
    parentSessionId: null,
    dryRun: false,
    comms: false,
    stripAnsi: false,
    json: false,
    jobsLimit: config.jobsListLimit,
    jobsAll: false,
    agentType: "implementation",
  };

  const positional: string[] = [];
  let command = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (command === "comms") {
      // Preserve raw comms args (e.g., `done <id> --file <path>`) for direct parsing later.
      positional.push(arg);
    } else if (arg === "-r" || arg === "--reasoning") {
      const level = args[++i] as ReasoningEffort;
      if (config.reasoningEfforts.includes(level)) {
        options.reasoning = level;
      } else {
        console.error(`Invalid reasoning level: ${level}`);
        console.error(`Valid options: ${config.reasoningEfforts.join(", ")}`);
        process.exit(1);
      }
    } else if (arg === "-m" || arg === "--model") {
      options.model = args[++i];
    } else if (arg === "-s" || arg === "--sandbox") {
      const mode = args[++i];
      if (mode === "read-only") {
        console.error(
          "Sandbox mode 'read-only' has been removed; using 'workspace-write' instead."
        );
        options.sandbox = "workspace-write";
        continue;
      }

      const sandboxMode = mode as SandboxMode;
      if (config.sandboxModes.includes(sandboxMode)) {
        options.sandbox = sandboxMode;
      } else {
        console.error(`Invalid sandbox mode: ${mode}`);
        console.error(`Valid options: ${config.sandboxModes.join(", ")}`);
        process.exit(1);
      }
    } else if (arg === "-f" || arg === "--file") {
      options.files.push(args[++i]);
    } else if (arg === "-d" || arg === "--dir") {
      options.dir = args[++i];
    } else if (arg === "--parent-session") {
      options.parentSessionId = args[++i] ?? null;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--comms") {
      options.comms = true;
    } else if (arg === "--strip-ansi") {
      options.stripAnsi = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--limit") {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 1) {
        console.error(`Invalid limit: ${raw}`);
        process.exit(1);
      }
      options.jobsLimit = Math.floor(parsed);
    } else if (arg === "--all") {
      options.jobsAll = true;
    } else if (arg === "--type") {
      const validTypes = ["research", "implementation", "review", "test"];
      const typeVal = args[++i];
      if (!validTypes.includes(typeVal)) {
        console.error(`Invalid agent type: ${typeVal}`);
        console.error(`Valid types: ${validTypes.join(", ")}`);
        process.exit(1);
      }
      options.agentType = typeVal;
    } else if (arg.startsWith("-")) {
      console.error(`unknown option: ${arg}`);
      process.exit(1);
    } else if (!arg.startsWith("-")) {
      if (!command) {
        command = arg;
      } else {
        positional.push(arg);
      }
    }
  }

  return { command, positional, options };
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatJobStatus(job: Job): string {
  const elapsed = job.startedAt
    ? formatDuration(
        (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) -
          new Date(job.startedAt).getTime()
      )
    : "-";

  const status = job.status.toUpperCase().padEnd(10);
  const promptPreview = job.prompt.slice(0, 50) + (job.prompt.length > 50 ? "..." : "");

  return `${job.id}  ${status}  ${elapsed.padEnd(8)}  ${job.reasoningEffort.padEnd(6)}  ${promptPreview}`;
}

function refreshJobsForDisplay(jobs: Job[]): Job[] {
  return jobs.map((job) => {
    if (job.status !== "running") return job;
    const refreshed = refreshJobStatus(job.id);
    return refreshed ?? job;
  });
}

function sortJobsRunningFirst(jobs: Job[]): Job[] {
  const statusRank: Record<Job["status"], number> = {
    running: 0,
    pending: 1,
    failed: 2,
    completed: 3,
  };

  return [...jobs].sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function applyJobsLimit<T>(jobs: T[], limit: number | null): T[] {
  if (!limit || limit <= 0) return jobs;
  return jobs.slice(0, limit);
}

function formatCommsMessage(msg: { type: string; ts?: string; msg?: string; summary?: string }): string {
  const time = msg.ts ? new Date(msg.ts).toLocaleTimeString() : "??:??";
  switch (msg.type) {
    case "status":
      return `[${time}] status: ${msg.msg}`;
    case "finding":
      return `[${time}] FINDING: ${msg.msg}`;
    case "done":
      return `[${time}] DONE: ${msg.summary}`;
    default:
      return `[${time}] ${JSON.stringify(msg)}`;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const { command, positional, options } = parseArgs(args);

  try {
    switch (command) {
      case "health": {
        // Check tmux
        if (!isTmuxAvailable()) {
          console.error("tmux not found");
          console.error("Install with: brew install tmux");
          process.exit(1);
        }
        console.log("tmux: OK");

        // Check codex
        const { execSync } = await import("child_process");
        try {
          const version = execSync("codex --version", { encoding: "utf-8" }).trim();
          console.log(`codex: ${version}`);
        } catch {
          console.error("codex CLI not found");
          console.error("Install with: npm install -g @openai/codex");
          process.exit(1);
        }

        console.log("Status: Ready");
        break;
      }

      case "start": {
        if (positional.length === 0) {
          console.error("Error: No prompt provided");
          process.exit(1);
        }

        // Check tmux first
        if (!isTmuxAvailable()) {
          console.error("Error: tmux is required but not installed");
          console.error("Install with: brew install tmux");
          process.exit(1);
        }

        let prompt = positional.join(" ");

        // Load file context if specified
        if (options.files.length > 0) {
          const files = await loadFiles(options.files, options.dir);
          prompt = formatPromptWithFiles(prompt, files);
          console.error(`Included ${files.length} files`);
        }

        if (options.dryRun) {
          const tokens = estimateTokens(prompt);
          console.log(`Would send ~${tokens.toLocaleString()} tokens`);
          console.log(`Model: ${options.model}`);
          console.log(`Reasoning: ${options.reasoning}`);
          console.log(`Sandbox: ${options.sandbox}`);
          console.log(`Agent type: ${options.agentType}`);
          console.log("\n--- Prompt Preview ---\n");
          console.log(prompt.slice(0, 3000));
          if (prompt.length > 3000) {
            console.log(`\n... (${prompt.length - 3000} more characters)`);
          }
          process.exit(0);
        }

        const job = startJob({
          prompt,
          model: options.model,
          reasoningEffort: options.reasoning,
          sandbox: options.sandbox,
          parentSessionId: options.parentSessionId ?? undefined,
          cwd: options.dir,
          type: options.agentType as import("./templates.ts").AgentType,
        });

        console.log(`Job started: ${job.id}`);
        console.log(`Model: ${job.model} (${job.reasoningEffort})`);
        console.log(`Working dir: ${job.cwd}`);
        console.log(`tmux session: ${job.tmuxSession}`);
        console.log("");
        console.log("Commands:");
        console.log(`  Capture output:  codex-agent capture ${job.id}`);
        console.log(`  Send message:    codex-agent send ${job.id} "message"`);
        console.log(`  Attach session:  tmux attach -t ${job.tmuxSession}`);
        break;
      }

      case "status": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const job = refreshJobStatus(positional[0]);
        if (!job) {
          console.error(`Job ${positional[0]} not found`);
          process.exit(1);
        }

        console.log(`Job: ${job.id}`);
        console.log(`Status: ${job.status}`);
        console.log(`Model: ${job.model} (${job.reasoningEffort})`);
        console.log(`Sandbox: ${job.sandbox}`);
        console.log(`Created: ${job.createdAt}`);
        if (job.startedAt) {
          console.log(`Started: ${job.startedAt}`);
        }
        if (job.completedAt) {
          console.log(`Completed: ${job.completedAt}`);
        }
        if (job.tmuxSession) {
          console.log(`tmux session: ${job.tmuxSession}`);
        }
        if (job.error) {
          console.log(`Error: ${job.error}`);
        }
        break;
      }

      case "send": {
        if (positional.length < 2) {
          console.error("Error: Usage: codex-agent send <jobId> \"message\"");
          process.exit(1);
        }

        const jobId = positional[0];
        const message = positional.slice(1).join(" ");

        if (sendToJob(jobId, message)) {
          console.log(`Sent to ${jobId}: ${message}`);
        } else {
          console.error(`Could not send to job ${jobId}`);
          console.error("Job may not be running or tmux session not found");
          process.exit(1);
        }
        break;
      }

      case "capture": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const captureJobId = positional[0];

        if (options.comms) {
          // Show formatted comms messages from JSONL
          const messages = readCommsFile(captureJobId);
          if (messages.length === 0) {
            console.error(`No comms messages for job ${captureJobId}`);
            process.exit(1);
          }
          for (const msg of messages) {
            console.log(formatCommsMessage(msg));
          }
        } else {
          // Default: show tmux terminal output
          const captureJob = loadJob(captureJobId);
          if (!captureJob) {
            console.error(`Job ${captureJobId} not found`);
            process.exit(1);
          }

          if (captureJob.tmuxSession && sessionExists(captureJob.tmuxSession)) {
            const lines = positional[1] ? parseInt(positional[1], 10) : 50;
            let output = capturePane(captureJob.tmuxSession, { lines });
            if (output) {
              if (options.stripAnsi) {
                output = stripAnsiCodes(output);
              }
              console.log(output);
            } else {
              console.error(`Could not capture tmux pane for job ${captureJobId}`);
              process.exit(1);
            }
          } else {
            console.error("Session ended");
            process.exit(1);
          }
        }
        break;
      }

      case "output": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        let output = getJobFullOutput(positional[0]);
        if (output) {
          if (options.stripAnsi) {
            output = stripAnsiCodes(output);
          }
          console.log(output);
        } else {
          console.error(`Could not get output for job ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      case "attach": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const attachCmd = getAttachCommand(positional[0]);
        if (attachCmd) {
          console.log(attachCmd);
        } else {
          console.error(`Job ${positional[0]} not found or no tmux session`);
          process.exit(1);
        }
        break;
      }

      case "watch": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const job = loadJob(positional[0]);
        if (!job || !job.tmuxSession) {
          console.error(`Job ${positional[0]} not found or no tmux session`);
          process.exit(1);
        }

        console.error(`Watching ${job.tmuxSession}... (Ctrl+C to stop)`);
        console.error("For interactive mode, use: tmux attach -t " + job.tmuxSession);
        console.error("");

        // Simple polling-based watch
        let lastOutput = "";
        const pollInterval = setInterval(() => {
          const output = getJobOutput(positional[0], 100);
          if (output && output !== lastOutput) {
            // Print only new content
            if (lastOutput) {
              const newPart = output.replace(lastOutput, "");
              if (newPart.trim()) {
                process.stdout.write(newPart);
              }
            } else {
              console.log(output);
            }
            lastOutput = output;
          }

          // Check if job is still running
          const refreshed = refreshJobStatus(positional[0]);
          if (refreshed && refreshed.status !== "running") {
            console.error(`\nJob ${refreshed.status}`);
            clearInterval(pollInterval);
            process.exit(0);
          }
        }, 1000);

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          clearInterval(pollInterval);
          console.error("\nStopped watching");
          process.exit(0);
        });
        break;
      }

      case "watch-comms": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const { getCommsPath, watchCommsFile, readCommsFile } = await import("./comms.ts");
        const commsPath = getCommsPath(positional[0]);

        console.error(`Watching comms for job ${positional[0]}...`);
        console.error(`File: ${commsPath}`);
        console.error("(Ctrl+C to stop)\n");

        // Print existing messages first
        const existing = readCommsFile(positional[0]);
        for (const msg of existing) {
          console.log(formatCommsMessage(msg));
        }

        // Watch for new messages
        const watcher = watchCommsFile(positional[0], (messages) => {
          for (const msg of messages) {
            console.log(formatCommsMessage(msg));
          }
        });

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          watcher.stop();
          console.error("\nStopped watching");
          process.exit(0);
        });
        break;
      }

      case "monitor": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const jobId = positional[0];
        const job = loadJob(jobId);
        if (!job) {
          console.error(`Job ${jobId} not found`);
          process.exit(1);
        }

        console.error(`Monitoring job ${jobId}...`);

        const { watchCommsFile } = await import("./comms.ts");
        const { sessionExists: checkSession } = await import("./tmux.ts");

        let doneReceived = false;
        let watcher: { stop: () => void } | null = null;
        let livenessInterval: ReturnType<typeof setInterval> | null = null;

        // Watch comms file for new messages
        watcher = watchCommsFile(jobId, (messages) => {
          for (const msg of messages) {
            console.log(formatCommsMessage(msg));
            if (msg.type === "done") {
              doneReceived = true;
              if ('resultFile' in msg && msg.resultFile) {
                console.log(`Result file: ${msg.resultFile}`);
              }
              cleanup(0);
            }
          }
        });

        // Session liveness polling (every 10 seconds)
        livenessInterval = setInterval(() => {
          if (doneReceived) return;
          if (job.tmuxSession && !checkSession(job.tmuxSession)) {
            const failMsg = JSON.stringify({
              type: "failed",
              ts: new Date().toISOString(),
              reason: "Session exited without completion"
            });
            console.log(failMsg);
            cleanup(1);
          }
        }, 10000);

        function cleanup(code: number) {
          watcher?.stop();
          if (livenessInterval) {
            clearInterval(livenessInterval);
          }
          process.exit(code);
        }

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          console.error("\nMonitoring stopped");
          cleanup(130);
        });

        break;
      }

      case "jobs": {
        if (options.json) {
          const payload = getJobsJson();
          const limit = options.jobsAll ? null : options.jobsLimit;
          const statusRank: Record<Job["status"], number> = {
            running: 0,
            pending: 1,
            failed: 2,
            completed: 3,
          };
          payload.jobs.sort((a, b) => {
            const rankDiff = statusRank[a.status] - statusRank[b.status];
            if (rankDiff !== 0) return rankDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          payload.jobs = applyJobsLimit(payload.jobs, limit);
          console.log(JSON.stringify(payload, null, 2));
          break;
        }

        const limit = options.jobsAll ? null : options.jobsLimit;
        const allJobs = refreshJobsForDisplay(listJobs());
        const jobs = applyJobsLimit(sortJobsRunningFirst(allJobs), limit);
        if (jobs.length === 0) {
          console.log("No jobs");
        } else {
          console.log("ID        STATUS      ELAPSED   EFFORT  PROMPT");
          console.log("-".repeat(80));
          for (const job of jobs) {
            console.log(formatJobStatus(job));
          }
        }
        break;
      }

      case "sessions": {
        const sessions = listSessions();
        if (sessions.length === 0) {
          console.log("No active codex-agent sessions");
        } else {
          console.log("SESSION NAME                    ATTACHED  CREATED");
          console.log("-".repeat(60));
          for (const session of sessions) {
            const attached = session.attached ? "yes" : "no";
            console.log(
              `${session.name.padEnd(30)}  ${attached.padEnd(8)}  ${session.created}`
            );
          }
        }
        break;
      }

      case "kill": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        if (killJob(positional[0])) {
          console.log(`Killed job: ${positional[0]}`);
        } else {
          console.error(`Could not kill job: ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      case "clean": {
        const cleaned = cleanupOldJobs(7);
        console.log(`Cleaned ${cleaned} old jobs`);
        break;
      }

      case "comms": {
        // Parse comms args directly from process.argv to avoid flag stripping
        const commsIdx = process.argv.indexOf("comms");
        const commsArgs = process.argv.slice(commsIdx + 1);
        const commsType = commsArgs[0];
        const commsJobId = commsArgs[1];

        if (!commsType || !commsJobId) {
          console.error("Usage: codex-agent comms <type> <jobId> [message]");
          console.error("");
          console.error("Types:");
          console.error("  status <jobId> <message>             Report current work phase");
          console.error("  finding <jobId> <message>            Report a discovery");
          console.error("  done <jobId> <summary>               Report task completion");
          console.error("  done <jobId> --file <path>           Report completion with result file");
          process.exit(1);
        }

        const rest = commsArgs.slice(2);

        if (commsType === "status" || commsType === "finding") {
          const msg = rest.join(" ");
          if (!msg) {
            console.error(`Error: ${commsType} requires a message`);
            process.exit(1);
          }
          if (commsType === "status") writeStatus(commsJobId, msg);
          else writeFinding(commsJobId, msg);
        } else if (commsType === "done") {
          // Check for --file flag in rest args
          const fileIdx = rest.indexOf("--file");
          if (fileIdx !== -1) {
            const filePath = rest[fileIdx + 1];
            if (!filePath) {
              console.error("Error: --file requires a path argument");
              process.exit(1);
            }
            const { existsSync, readFileSync } = await import("fs");
            if (!existsSync(filePath)) {
              console.error(`Error: file not found: ${filePath}`);
              process.exit(1);
            }
            const content = readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            // Extract summary from first heading or first non-empty line
            let summary = "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith("#")) {
                summary = trimmed.replace(/^#+\s*/, "");
              } else {
                summary = trimmed;
              }
              break;
            }
            if (!summary) {
              summary = "(result file attached)";
            }
            writeDone(commsJobId, summary, filePath);
          } else {
            const summary = rest.join(" ");
            if (!summary) {
              console.error("Error: done requires a summary or --file <path>");
              process.exit(1);
            }
            writeDone(commsJobId, summary);
          }
        } else {
          console.error(`Unknown comms type: ${commsType}`);
          console.error("Valid types: status, finding, done");
          process.exit(1);
        }
        break;
      }

      case "delete": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        if (deleteJob(positional[0])) {
          console.log(`Deleted job: ${positional[0]}`);
        } else {
          console.error(`Could not delete job: ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      default:
        // Treat as prompt for start command
        if (command) {
          // Check tmux first
          if (!isTmuxAvailable()) {
            console.error("Error: tmux is required but not installed");
            console.error("Install with: brew install tmux");
            process.exit(1);
          }

          const prompt = [command, ...positional].join(" ");

          if (options.dryRun) {
            const tokens = estimateTokens(prompt);
            console.log(`Would send ~${tokens.toLocaleString()} tokens`);
            process.exit(0);
          }

          const job = startJob({
            prompt,
            model: options.model,
            reasoningEffort: options.reasoning,
            sandbox: options.sandbox,
            parentSessionId: options.parentSessionId ?? undefined,
            cwd: options.dir,
          });

          console.log(`Job started: ${job.id}`);
          console.log(`tmux session: ${job.tmuxSession}`);
          console.log(`Attach: tmux attach -t ${job.tmuxSession}`);
        } else {
          console.log(HELP);
        }
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}

main();
