# Codex Orchestrator

<p align="center">
  <img src="codex-agent-hero.jpeg" alt="Claude orchestrating Codex agents" width="600">
</p>

Delegate tasks to OpenAI Codex agents via tmux sessions. Designed for Claude Code orchestration.

Spawn parallel coding agents, monitor their progress, send follow-up messages mid-task, and capture results - all from Claude Code or the command line.

## Installation

### Option A: Claude Code Plugin (Recommended)

Install the plugin, then let it handle everything else.

**Step 1:** Add the marketplace:

```
/plugin marketplace add 0xabrar/codex-orchestrator
```

**Step 2:** Install the plugin:

```
/plugin install codex-orchestrator
```

**Step 3:** Restart Claude Code (may be required for the skill to load)

**Step 4:** Install the CLI and dependencies:

```bash
bash plugins/codex-orchestrator/scripts/install.sh
```

This installs Bun, tmux, the Codex CLI, and the `codex-agent` command. The script detects your platform, checks each dependency, and installs what's missing. No manual setup required.

**Step 5:** Use it - just ask Claude to do things. The skill activates automatically for coding tasks.

### Option B: CLI Only (no Claude Code integration)

If you just want the `codex-agent` CLI without the Claude Code plugin:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/0xabrar/codex-orchestrator/main/plugins/codex-orchestrator/scripts/install.sh)
```

The script installs dependencies, installs/updates codex-orchestrator, configures PATH, and runs a health check.

#### Manual fallback (if you prefer step-by-step install)

```bash
# Prerequisites
brew install tmux              # macOS (or apt/pacman/dnf for Linux)
npm install -g @openai/codex   # OpenAI Codex CLI
codex --login                  # Authenticate with OpenAI
curl -fsSL https://bun.sh/install | bash  # Install Bun

# Install
git clone https://github.com/0xabrar/codex-orchestrator.git ~/.codex-orchestrator
cd ~/.codex-orchestrator && bun install

# Add to PATH (add this line to ~/.bashrc or ~/.zshrc)
export PATH="$HOME/.codex-orchestrator/bin:$PATH"

# Verify
codex-agent health
```

You get the full CLI but not the Claude Code skill. You will need to manage agents manually.

### Requirements

| Dependency | Purpose | Install |
|-----------|---------|---------|
| [tmux](https://github.com/tmux/tmux) | Terminal multiplexer - agents run in tmux sessions | `brew install tmux` |
| [Bun](https://bun.sh) | JavaScript runtime - runs the CLI | `curl -fsSL https://bun.sh/install \| bash` |
| [Codex CLI](https://github.com/openai/codex) | OpenAI's coding agent - the thing being orchestrated | `npm install -g @openai/codex` |
| OpenAI account | API access for Codex agents | `codex --login` |

**Platform support:** macOS and Linux. Windows users should use WSL.

## Why?

When you're working with Claude Code and need parallel execution, investigation tasks, or long-running operations - spawn Codex agents in the background. They run in tmux sessions so you can:

- **Watch live** - Attach to any session and see exactly what the agent is doing
- **Talk back** - Send follow-up messages mid-task to redirect or add context
- **Run in parallel** - Spawn multiple agents investigating different parts of a codebase
- **Capture results** - Grab output programmatically when agents finish

Claude handles the strategic thinking (planning, synthesis, communication). Codex handles the deep coding work (research, implementation, review, testing). Together they cover both the orchestration and execution layers.

## Quick Start

```bash
# Start a research agent
codex-agent start "Review this codebase for security vulnerabilities" --type research

# Watch its findings in real-time
codex-agent watch-comms <jobId>

# Check all job statuses
codex-agent jobs --json

# Redirect the agent mid-task
codex-agent send <jobId> "Focus on the authentication module instead"
```

## Commands

| Command | Description |
|---------|-------------|
| `start <prompt>` | Start a new agent with the given prompt |
| `status <id>` | Check job status and details |
| `send <id> <msg>` | Send a message to redirect a running agent |
| `capture <id> [n]` | Get last n lines of output (default: 50); use `--comms` to show formatted comms messages |
| `output <id>` | Get full session output |
| `attach <id>` | Print tmux attach command |
| `watch <id>` | Stream output updates |
| `watch-comms <id>` | Watch agent comms in real-time |
| `monitor <id>` | Block until the agent completes |
| `comms <subcommand> <id> <msg>` | Write agent comms messages (`status`, `finding`, `done`) |
| `jobs` | List all jobs |
| `jobs --json` | List jobs with structured metadata (tokens, files, summary) |
| `sessions` | List active tmux sessions |
| `kill <id>` | Terminate a running job (last resort) |
| `delete <id>` | Delete a job and related local files |
| `clean` | Remove jobs older than 7 days |
| `health` | Check tmux and codex availability |

## Options

| Option | Description |
|--------|-------------|
| `-r, --reasoning <level>` | Reasoning effort: `low`, `medium`, `high`, `xhigh` |
| `-m, --model <model>` | Model name (default: gpt-5.3-codex) |
| `-s, --sandbox <mode>` | `workspace-write` (default), `danger-full-access` |
| `-f, --file <glob>` | Include files matching glob (repeatable) |
| `-d, --dir <path>` | Working directory |
| `--type <type>` | Agent role: `research`, `implementation`, `review`, `test` |
| `--parent-session <id>` | Parent session ID for agent comms linkage |
| `--comms` | Show formatted comms messages in `capture` output |
| `--strip-ansi` | Remove terminal control codes from output |
| `--json` | Output JSON (jobs command only) |
| `--limit <n>` | Limit number of jobs shown (`jobs` command only) |
| `--all` | Include all jobs, not just recent (`jobs` command only) |
| `--dry-run` | Preview prompt without executing |

## Jobs JSON Output

Get structured job data with `jobs --json`:

```json
{
  "generated_at": "2026-02-12T18:44:21.102Z",
  "jobs": [
    {
      "id": "8abfab85",
      "status": "completed",
      "prompt": "Review src/auth.ts and src/session.ts for auth bypass issues.",
      "model": "gpt-5.3-codex",
      "reasoning": "high",
      "cwd": "/home/dev/code/codex-orchestrator",
      "elapsed_ms": 14897,
      "created_at": "2026-02-12T18:43:47.105Z",
      "started_at": "2026-02-12T18:43:49.002Z",
      "completed_at": "2026-02-12T18:44:03.899Z",
      "tokens": {
        "input": 36581,
        "output": 282,
        "context_window": 258400,
        "context_used_pct": 14.16
      },
      "files_modified": [
        "src/auth.ts",
        "src/types.ts"
      ],
      "summary": "Implemented auth flow hardening and added validation for session tokens."
    }
  ]
}
```

## Examples

### Parallel Investigation

```bash
# Spawn multiple agents to investigate different areas
codex-agent start "Audit authentication flow" -r high
codex-agent start "Review database queries for N+1 issues" -r high
codex-agent start "Check for XSS vulnerabilities in templates" -r high

# Monitor all agents via comms
codex-agent jobs --json
codex-agent watch-comms <jobId>
```

### Redirecting an Agent

```bash
# Agent going down wrong path? Redirect it
codex-agent send abc123 "Stop - focus on the auth module instead"

# Agent needs info? Send it
codex-agent send abc123 "The dependency is installed. Continue with typecheck."

# Attach for direct interaction
tmux attach -t codex-agent-abc123
# (Ctrl+B, D to detach)
```

### With File Context

```bash
# Include specific files in the prompt
codex-agent start "Review these files for bugs" -f "src/auth/**/*.ts" -f "src/api/**/*.ts"
```

## How It Works

1. You run `codex-agent start "task"`
2. It creates a detached tmux session
3. It launches the Codex CLI inside that session
4. It sends your prompt to Codex
5. It returns immediately with the job ID
6. Codex works in the background
7. You check with `jobs --json`, `capture`, `output`, or `attach`
8. You redirect with `send` if the agent needs course correction

Agents write JSONL updates to `/tmp/codex-agent/{jobId}.jsonl` for real-time monitoring. Use `watch-comms` to stream these updates as they arrive. Session metadata is parsed from Codex's JSONL files (`~/.codex/sessions/`) to extract tokens, file modifications, and summaries.

## The Claude Code Plugin

When installed as a Claude Code plugin, the **codex-orchestrator skill** teaches Claude how to use the CLI automatically. Claude becomes the orchestrator:

- Breaks your requests into agent-sized tasks
- Spawns agents with the right flags (workspace-write by default, danger-full-access when necessary)
- Monitors agent progress via comms files
- Synthesizes findings from multiple agents
- Course-corrects agents that drift off-task

This means you can just describe what you want, and Claude handles the delegation.

### Modes

The skill operates in three modes with distinct goals:

- **Brainstorm** - Explore the problem space interactively with Claude and spawn research agents to investigate unknowns before implementation.
- **Decompose** - Convert an approved design doc into an implementation-ready PRD with user stories and a dependency graph.
- **Execute** - Implement the PRD in parallel by spawning coding agents, monitoring comms files, and synthesizing completed work.

Invoke each mode with:

```bash
/brainstorm
/decompose
/execute
```

Workflow:

`brainstorm -> design doc -> decompose -> PRD -> execute -> implementation`

When to use each mode:

- **Brainstorm** - Use when the problem is still fuzzy, you need options/tradeoffs, or technical discovery is needed.
- **Decompose** - Use when the design direction is decided and you need a concrete build plan with story-level sequencing.
- **Execute** - Use when the PRD is ready and you want parallel implementation with orchestrated agent monitoring.

See [plugins/codex-orchestrator/README.md](plugins/codex-orchestrator/README.md) for full plugin documentation.

## Job Storage

```
~/.codex-agent/jobs/
  <jobId>.json    # Job metadata
  <jobId>.prompt  # Original prompt

/tmp/codex-agent/
  <jobId>.jsonl   # Agent comms (JSONL updates)
```

## Tips

- Use `codex-agent send` to redirect agents - don't kill and respawn
- Use `jobs --json` to get structured data (tokens, files, summary) in one call
- Use `watch-comms` to stream agent updates in real-time instead of polling
- Use `--strip-ansi` when capturing output programmatically
- Use `-r xhigh` for complex tasks that need deep reasoning
- Use default `workspace-write` for most tasks; use `-s danger-full-access` only when strictly required
- Kill stuck jobs with `codex-agent kill <id>` only as a last resort

## License

MIT
