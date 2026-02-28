# Codex Agents Reference

Shared reference for all orchestrator skills. Read this file when any skill tells you to.

## The Command Structure

```
USER - directs the mission
    |
    ├── CLAUDE #1 (Opus) --- General
    |       ├── CODEX agent
    |       ├── CODEX agent
    |       └── CODEX agent ...
    |
    ├── CLAUDE #2 (Opus) --- General
    |       ├── CODEX agent
    |       └── CODEX agent ...
    |
    ├── CLAUDE #3 (Opus) --- General
    |       └── CODEX agent ...
    |
    └── CLAUDE #4 (Opus) --- General
            └── CODEX agent ...
```

**The user is in command.** They set the vision, make strategic decisions, approve plans.

**You (Claude) are their general.** You command YOUR Codex army:
- You decide which agents to spawn and what tasks to give them
- You coordinate agents working in parallel
- You course-correct or kill agents as needed
- You synthesize work into results for the user

**Codex agents are the army.** Hyper-focused coding specialists. They read codebases deeply, implement carefully, and verify their work.

## Critical Rules

### Rule 1: Codex Agents Are the Default

For ANY task involving code, research, file investigation, security audits, testing, multi-step execution, or file access: **spawn Codex agents. Do not do it yourself. Do not use Claude subagents.**

### Rule 2: You Are the Orchestrator, Not the Implementer

Your job: discuss strategy, write PRDs/specs, spawn and direct agents, synthesize findings, communicate progress.

Not your job: implementing code yourself, extensive file reads, using Claude subagents (Task tool).

### Rule 3: Only Exceptions

Use Claude subagents ONLY when the user explicitly requests it or for a quick single-file read for conversational context.

Clarifying note: Claude teammates that run `codex-agent start` + `codex-agent monitor` and relay Codex results back are an intentional execute-skill exception and are allowed. These teammates are monitoring wrappers only. Do not delegate the actual coding, implementation, or research work to Claude subagents.

## Prerequisites

Three things must be installed:

1. **tmux** — Terminal multiplexer (agents run in tmux sessions)
2. **Bun** — JavaScript runtime (runs the CLI)
3. **OpenAI Codex CLI** — The coding agent being orchestrated

The user must also be **authenticated with OpenAI** (`codex --login`).

### Quick Check

```bash
codex-agent health
```

### If Not Installed

Run the install script — do NOT manually install dependencies:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

Fallback if `${CLAUDE_PLUGIN_ROOT}` is not available:

```bash
bash ~/.codex-orchestrator/plugins/codex-orchestrator/scripts/install.sh
```

## CLI Defaults

| Setting | Default | Why |
|---------|---------|-----|
| Model | `gpt-5.3-codex` | Latest and most capable Codex model |
| Reasoning | Per agent type (see below) | Depth varies by role |
| Sandbox | `workspace-write` | Agents can modify files by default |

## CLI Reference

### Spawning Agents
```bash
codex-agent start "Investigate auth flow for vulnerabilities" --type research
codex-agent start "Implement the auth refactor per PRD" --type implementation -f "docs/prds/auth-refactor.md"
codex-agent start "Review these modules" --type review -f "src/auth/**/*.ts"
codex-agent start "Write integration tests for auth" --type test -f "src/auth/**/*.ts"
codex-agent start "Verify Story 4 acceptance criteria against changed files" --type spec-review -f "src/templates.ts"
codex-agent start "Assess Story 4 code quality and test quality" --type quality-review -f "src/templates.ts"
```

### Monitoring Agents
```bash
codex-agent jobs --json                # structured status (preferred for non-blocking checks)
codex-agent jobs                       # human-readable table
codex-agent monitor <jobId>            # block until done (exits 0 on success, non-zero on failure)
codex-agent capture <jobId>            # tmux output (debug)
codex-agent capture <jobId> 200        # more lines
codex-agent capture <jobId> --comms    # formatted comms messages
codex-agent watch-comms <jobId>        # streaming comms (for humans in terminal)
```

### Communicating with Agents
```bash
codex-agent send <jobId> "Focus on the database layer"
codex-agent send <jobId> "The dependency is installed. Run bun run typecheck"
tmux attach -t codex-agent-<jobId>     # direct interaction
```

### Agent Comms (used by agents themselves)
```bash
codex-agent comms status <jobId> "Starting database migration"
codex-agent comms finding <jobId> "Found SQL injection in user query"
codex-agent comms done <jobId> "Implemented auth refactor"
codex-agent comms done <jobId> --file /tmp/codex-agent/<jobId>-result.md
```

### Control
```bash
codex-agent kill <jobId>               # last resort
codex-agent clean                      # remove old jobs (>7 days)
codex-agent health                     # verify setup
```

## Flags Reference

| Flag | Short | Values | Description |
|------|-------|--------|-------------|
| `--type` | | research, implementation, review, test, spec-review, quality-review | Agent role (default: implementation) |
| `--reasoning` | `-r` | low, medium, high, xhigh | Reasoning depth (overrides type default) |
| `--sandbox` | `-s` | workspace-write, danger-full-access | File access level |
| `--file` | `-f` | glob | Include files (repeatable) |
| `--dir` | `-d` | path | Working directory |
| `--model` | `-m` | string | Model override |
| `--json` | | flag | JSON output (jobs only) |
| `--strip-ansi` | | flag | Clean output |
| `--dry-run` | | flag | Preview prompt without executing |
| `--file` (comms done) | | path | Result file path for done message |

**`--type` details:**
- `research` — Codebase exploration. Agent does not modify source files. Writes findings to comms and result file.
- `implementation` — Code changes. Default type. Agent implements the task and writes a change summary to the result file.
- `review` — Code review. Agent does not modify source files. Writes review findings to comms and result file.
- `test` — Test writing and execution. Agent writes/runs tests and reports results to the result file.
- `spec-review` — Spec compliance review. Agent reads actual changed code, verifies each acceptance criterion, and reports PASS/FAIL with file:line references.
- `quality-review` — Code quality review. Agent evaluates implementation quality, error handling, security, and tests. Findings are grouped by Critical, Important, and Minor with file:line references.

**Default reasoning by agent type:**

| Agent Type | Default Reasoning | Rationale |
|---|---|---|
| `implementation` | `xhigh` | Deepest reasoning for core coding work |
| `research` | `high` | Exploration and analysis |
| `review` | `high` | Code review |
| `test` | `high` | Test writing and execution |
| `spec-review` | `high` | Spec compliance verification |
| `quality-review` | `high` | Code quality assessment |

Use `-r` to override the default for any agent type.

**`--file` on `comms done`:**
When an agent completes, it can reference its result file instead of an inline summary:
```bash
codex-agent comms done <jobId> --file /tmp/codex-agent/<jobId>-result.md
```
The CLI reads the file, extracts a summary from the first heading or line, and writes a `done` comms message with a `resultFile` field pointing to the full output.

## Review Pipeline

Use a multi-stage review loop per story. Start reviews as soon as each implementation agent completes; do not wait for the whole batch.

```text
Implementation Agent
  -> Spec-Review Agent
     -> PASS all criteria: Quality-Review Agent
        -> No Critical findings: Story DONE
        -> Critical findings: Fix Agent -> re-run quality review (max 2 fix cycles)
     -> Any FAIL criteria: Fix Agent -> re-run spec review (max 2 fix cycles)
```

Rules:
- A story is done only after it passes both spec review and quality review.
- If a stage still fails after 2 fix cycles, escalate unresolved issues to the user and stop that story.
- Fix work is usually spawned as an `implementation` agent with the failed review findings included in its prompt.

### Information Flow Between Agents

Agents do not talk directly to each other. The orchestrator passes context through result files:

1. Implementation agent writes `/tmp/codex-agent/{jobId}-result.md`.
2. Orchestrator reads that result file and includes relevant excerpts in the spec-review prompt (plus story criteria and changed files).
3. Spec-review agent writes its result file; orchestrator reads it.
4. If spec passes, orchestrator spawns quality-review with implementation context and changed files.
5. If either review fails, orchestrator spawns a fix agent and includes both the implementation report and review findings in the fix prompt.
6. Fix agent writes a new result file; orchestrator re-runs the failed review stage.

## Result File Protocol

Agents write detailed findings and output to a markdown file at a well-known path:

```
/tmp/codex-agent/{jobId}-result.md
```

**How it works:**
1. The agent performs its task, writing short status updates to the JSONL comms file as it goes
2. Before finishing, the agent writes its detailed output (findings, change summary, review, test results) to `/tmp/codex-agent/{jobId}-result.md`
3. The agent runs `codex-agent comms done <jobId> --file /tmp/codex-agent/<jobId>-result.md`
4. The CLI writes a `done` message to the JSONL comms file with a `resultFile` field
5. The orchestrator detects completion (via `monitor` or polling), then reads the result file for full details

**Why two channels:**
- **JSONL comms file** (`/tmp/codex-agent/{jobId}.jsonl`) — Lightweight, append-only event stream. Used for real-time status updates, findings, and completion signals. Kept small so the orchestrator can poll cheaply.
- **Result file** (`/tmp/codex-agent/{jobId}-result.md`) — Detailed output. Can be arbitrarily long. Only read on demand by the orchestrator after the agent reports done.

This separation keeps the monitoring loop fast while preserving full detail for when it matters.

## Agent Communication System

The CLI automatically injects comms instructions into every agent prompt. Agents write structured JSONL updates to `/tmp/codex-agent/{jobId}.jsonl` and detailed output to `/tmp/codex-agent/{jobId}-result.md`:

| Command | When |
|---------|------|
| `codex-agent comms status <jobId> "msg"` | Starting a new phase of work |
| `codex-agent comms finding <jobId> "msg"` | Discovery during research/review |
| `codex-agent comms done <jobId> "summary"` | Task complete (inline summary) |
| `codex-agent comms done <jobId> --file <path>` | Task complete (with result file) |

**Monitoring with `codex-agent monitor`:**
The `monitor` command blocks until the agent completes. It watches the comms file and prints messages as they arrive. On completion:
- Exits 0 and prints the result file path if the agent wrote a `done` message
- Exits non-zero if the tmux session died without a `done` message

This is the preferred way for teammates to wait on an agent. No polling loop needed.

**Liveness:** Checked via tmux session status (deterministic), not agent messages. Agents may be "thinking" for 10+ minutes without writing comms — that's normal.

**Completion:** Detected from the `done` comms message (preferred), tmux session exit, or session completion marker.

**Stuck detection:**
- Check if tmux session is alive: `codex-agent jobs --json`
- Check last comms activity timestamp
- Send a redirect: `codex-agent send <jobId> "Status update?"`
- Kill only as last resort: `codex-agent kill <jobId>`

## Agent Timing Expectations (CRITICAL)

**Codex agents take time. This is NORMAL. Do NOT be impatient.**

| Task Type | Typical Duration |
|-----------|------------------|
| Simple research | 10-20 minutes |
| Implementation (single feature) | 20-40 minutes |
| Spec review | 10-20 minutes |
| Quality review | 10-20 minutes |
| Fix agent | 15-30 minutes |
| Complex implementation | 30-60+ minutes |
| Full PRD implementation | 45-90+ minutes |

**Do NOT:**
- Kill agents just because they've been running for 20 minutes
- Assume something is wrong after 30+ minutes
- Spawn replacements for "slow" agents
- Ask the user "should I check on the agent?" after 15 minutes

**DO:**
- Use `codex-agent monitor <jobId>` to block until completion
- Use `codex-agent jobs --json` for a non-blocking status check
- Send clarifying messages if genuinely stuck
- Let agents finish — they are thorough for a reason
- Trust the process

## Prompt Guidelines

Just write your task description. The CLI automatically injects comms instructions, role descriptions, and result file paths based on `--type`. No need to manually construct prompts.

## Error Recovery

### Agent Stuck
```bash
codex-agent monitor <jobId>                       # check if still producing output
codex-agent capture <jobId> 100                    # inspect recent tmux output
codex-agent send <jobId> "Status update - what's blocking you?"
codex-agent kill <jobId>                           # only if truly stuck
```

### Agent Didn't Get Message
1. Check agent is still running: `codex-agent jobs --json`
2. Agent might be "thinking" — wait
3. Try sending again with clearer instruction
4. Attach directly: `tmux attach -t codex-agent-<jobId>`

### Implementation Failed
1. Check the error in output
2. Don't retry with the same prompt
3. Mutate the approach — add context about what failed
4. Consider splitting into smaller tasks

## Post-Compaction Recovery

After Claude's context compacts, immediately:
```bash
codex-agent jobs --json
```

Check the status of all running agents. For any that have completed, read their result files:
```bash
cat /tmp/codex-agent/{jobId}-result.md
```

Resume from where you left off based on agent statuses and result file contents.
