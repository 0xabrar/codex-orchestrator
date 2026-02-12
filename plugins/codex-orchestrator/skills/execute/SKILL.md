---
name: execute
description: Execute a PRD by spawning parallel Codex agents for each user story batch. Reads the dependency graph, runs independent stories in parallel, and sequences dependent batches. The core orchestration mode.
triggers:
  - execute
  - codex execute
  - codex-orchestrator
  - spawn codex
  - use codex
  - delegate to codex
  - start agent
  - codex agent
---

# Execute

Parallel implementation driven by a PRD. Spawn Codex agents for each user story, respect the dependency graph, run independent stories in parallel.

**Before proceeding, read the Codex agent reference:** `${CLAUDE_PLUGIN_ROOT}/references/codex-agents.md`

## The End-to-End Pipeline

| Mode | Skill | Purpose |
|------|-------|---------|
| **Brainstorm** | `brainstorm` | Explore idea → design doc. Uses Codex agents for research. |
| **Decompose** | `decompose` | Design doc → PRD with phased user stories. Pure Claude work. |
| **Execute** | `execute` (this skill) | PRD → parallel Codex implementation. |

**Flow:** brainstorm → decompose → execute

## Input

- Design doc (e.g., `docs/plans/2026-02-12-feature-design.md`)
- PRD with user stories (e.g., `docs/plans/prd-feature.md`)

If no PRD exists yet, tell the user to run the `decompose` skill first.

## Execution Flow (Agent Teams)

You are the **team lead**. You spawn **teammates** (general-purpose Claude subagents), each of which wraps exactly one Codex session. Teammates handle the blocking wait and relay events back to you via `SendMessage`.

### 1. Read the PRD

Understand the stories and dependency graph.

### 2. Identify the first parallel batch

Stories with no unresolved dependencies form the first batch.

### 3. Spawn a teammate for each story in the batch

Each teammate is a general-purpose subagent that runs two commands sequentially:

**Step A — Start the agent:**
```bash
codex-agent start --type implementation "Implement Story 1: [title]. [description]. Acceptance criteria: [criteria]." -f "docs/plans/design.md" -f "docs/plans/prd-feature.md"
```

Use `--type` to match the agent role:
- `--type implementation` — code changes (default)
- `--type research` — codebase exploration, no code changes
- `--type review` — code review for bugs and quality
- `--type test` — write and run tests

**Step B — Monitor until completion:**
```bash
codex-agent monitor <jobId>
```

`monitor` blocks until the agent writes a `done` comms message (exits 0) or the tmux session dies without completion (exits non-zero). The teammate does not need to poll — `monitor` handles it.

**Step C — Relay result back:**
When monitor exits, the teammate sends a message to you (the team lead) via `SendMessage` with:
- The job ID
- The exit status (success or failure)
- The result file path: `/tmp/codex-agent/{jobId}-result.md`

### 4. Receive teammate messages and read results

As teammates report back:
- On **success**: read the result file at `/tmp/codex-agent/{jobId}-result.md` for the detailed output
- On **failure**: check `codex-agent capture {jobId}` for diagnostics, decide whether to retry with a modified prompt
- Track which stories in the current batch are complete

### 5. When a batch completes, fire the next batch

Once all stories in a batch are done, identify the next set of unblocked stories from the dependency graph. Spawn a new round of teammates for those stories.

### 6. Repeat until all stories are implemented

### 7. Optionally spawn review and test agents

After implementation, spawn agents with `--type review` and `--type test` to verify the work.

### 8. Report progress

Summarize results for the user — do not flood context with full output from result files. Distill the key outcomes.

## Story-to-Agent Mapping

- One Codex agent per story (default)
- Include the design doc and PRD as file context for every agent
- Write clear prompts: story title, description, acceptance criteria
- Agents verify their work against acceptance criteria before reporting done
- Each agent writes detailed output to `/tmp/codex-agent/{jobId}-result.md`

## When NOT to Use This Pipeline

Basically never. Codex agents are the default for all execution work.

**The ONLY exceptions:**
- The user explicitly says "you do it" or "don't use Codex"
- Pure conversation/discussion (no code, no files)
- Quick single-file read for conversational context

**Everything else goes to Codex agents** — including "simple" changes and "quick" fixes. Your job is orchestration, not implementation.
