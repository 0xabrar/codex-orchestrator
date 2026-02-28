# Superpowers-Inspired Disciplines Design

## Problem

The codex-orchestrator has a solid brainstorm → decompose → execute pipeline, but implementation agents are fire-and-forget with no quality enforcement. There's no TDD discipline, no verification-before-completion, no systematic debugging methodology, and no structured review pipeline. The superpowers plugin provides all of these for in-process Claude subagents — we need to adapt them for async Codex agent execution.

## Solution

Adapt superpowers' quality disciplines for the Codex async model:

1. **Disciplines as prompt injections** — TDD, verification-before-completion, and systematic debugging get baked into every implementation agent's prompt via `src/templates.ts`. Agents follow these autonomously.

2. **Review pipeline as orchestration steps** — After each implementation agent completes, the orchestrator spawns spec-review and quality-review agents as separate Codex processes. Fix loops run up to 2 cycles per review stage before escalating.

3. **Strengthened brainstorm gates** — Harder enforcement language and rationalization prevention.

No changes to the codex-agent CLI, tmux transport, JSONL comms, or result file protocol. No git worktrees. Same pipes, better instructions flowing through them.

## Architecture

### Prompt Template Changes (`src/templates.ts`)

#### New Agent Types

Expand `AgentType` union:

```typescript
type AgentType = "research" | "implementation" | "review" | "test" | "spec-review" | "quality-review";
```

#### Disciplines Block

A new `buildDisciplinesBlock()` function returns a markdown section injected into every `implementation` prompt:

**TDD:**
- Write a failing test BEFORE any implementation code
- Run it, confirm it fails for the right reason (missing feature, not typo)
- Write minimal code to make it pass
- Run tests again, confirm green
- Refactor if needed, keeping tests green
- Repeat for each piece of functionality
- If you wrote code before a test: delete it and start over

**Verification Before Completion:**
- Before reporting done, run the FULL test suite (not just new tests)
- Include complete test output in result file
- If any test fails, fix it before reporting done
- No "should work" — run it and prove it

**Systematic Debugging (when something breaks):**
- Do NOT guess at fixes — find root cause first
- Read error messages carefully, including full stack traces
- Reproduce the issue consistently before attempting a fix
- Form a single hypothesis, test it with the smallest possible change
- If 3+ fix attempts fail, report the issue with investigation notes rather than continuing to guess

#### New Role Descriptions

**spec-review:**
> You are a spec compliance reviewer. Compare the implementation against the story spec and acceptance criteria. Read the ACTUAL CODE in the changed files — do not trust the implementation report. For each acceptance criterion, verify it is met by reading the relevant code. Report PASS or FAIL for each criterion with specific file:line references. If any criterion fails, explain exactly what is missing or wrong.

**quality-review:**
> You are a code quality reviewer. Review the implementation for code quality, patterns, error handling, security, and test quality. Categorize issues as Critical (must fix before proceeding), Important (should fix), or Minor (nice to have). Be specific — reference file:line for every issue. Acknowledge what was done well.

#### New PromptOptions Fields

```typescript
interface PromptOptions {
  // ... existing fields ...
  implementationReport?: string;  // result.md contents from impl agent
  storyCriteria?: string;         // acceptance criteria from PRD
  changedFiles?: string[];        // files the impl agent modified
}
```

#### Prompt Assembly by Type

| Type | Sections |
|------|----------|
| implementation | Comms → Role → **Disciplines** → Context → Scope → Task |
| spec-review | Comms → Role → Story Spec → Implementation Report → Changed Files → Task |
| quality-review | Comms → Role → Implementation Summary → Changed Files → Task |
| research/review/test | Unchanged |

### Enhanced Execute Pipeline (`skills/execute/SKILL.md`)

#### Per-Story Pipeline

Each story goes through a multi-stage pipeline. Reviews start immediately when each implementation agent finishes (parallel per story, don't wait for the whole batch):

```
Implementation Agent completes
  │
  ▼
Orchestrator reads result.md
  │
  ▼
Spawn Spec-Review Agent
  (prompt includes: story spec + acceptance criteria + impl result + changed files)
  │
  ▼
Read spec-review result.md
  │
  ├── All criteria PASS ──▶ Spawn Quality-Review Agent
  │                          (prompt includes: impl result + changed files)
  │                          │
  │                          ├── No Critical issues ──▶ Story DONE
  │                          │
  │                          └── Critical issues ──▶ Spawn Fix Agent
  │                               (prompt includes: impl report + quality findings)
  │                               └── Re-run quality review (max 2 cycles)
  │
  └── Any criteria FAIL ──▶ Spawn Fix Agent
                             (prompt includes: story spec + impl report + spec failures)
                             └── Re-run spec review (max 2 cycles)
```

#### Information Flow Between Agents

Agents never communicate directly. The orchestrator is the memory:

1. Implementation agent writes `{jobId}-result.md` → orchestrator reads it
2. Orchestrator pastes relevant content from that result into the review agent's prompt
3. Review agent writes `{jobId}-result.md` → orchestrator reads it
4. If fix needed: orchestrator pastes both impl report + review findings into fix agent's prompt
5. Fix agent writes `{jobId}-result.md` → orchestrator reads it, re-runs review

#### Teammate Wrapping

Same as current — each Codex agent gets a Claude teammate that runs `codex-agent start` + `codex-agent monitor` and relays the result back via `SendMessage`. New teammates are spawned for review and fix agents.

#### Batch Progression

- A story is "done" only after it passes both spec and quality reviews
- A batch is complete only when all stories in it are done
- Then the next batch fires

#### Escalation

If a story fails review after 2 fix cycles, the orchestrator stops that story's pipeline and reports the unresolved issues to the user. Other stories continue independently.

#### Final Review

After all batches complete, spawn a final review agent that reviews the entire changeset across all stories. This catches cross-story integration issues, inconsistencies, and architectural concerns that per-story reviews can't see.

### Strengthened Brainstorm Skill (`skills/brainstorm/SKILL.md`)

Minor tightening of the existing skill:

1. **Rationalization prevention** — List of red flags:
   - "This is too simple to need a design"
   - "Let me just code this quickly"
   - "I'll design as I go"
   - "The user already knows what they want"
   - "I already understand the codebase"

2. **Explicit gates between steps** — "Do NOT proceed to step N+1 until step N is complete and approved by the user"

3. **Mandatory task creation** — Frame the 6 checklist items as tasks to track progress

### Updated Codex-Agents Reference (`references/codex-agents.md`)

1. Add `spec-review` and `quality-review` to `--type` documentation and flags table
2. New "Review Pipeline" section explaining the multi-stage flow
3. Updated timing table with review and fix agent durations
4. Information flow guidance for passing context between agent stages

## Implementation Notes

### Files to Modify

| File | Change |
|------|--------|
| `src/templates.ts` | Add disciplines block, new agent types, new prompt options |
| `plugins/.../skills/execute/SKILL.md` | Add multi-stage review pipeline |
| `plugins/.../skills/brainstorm/SKILL.md` | Strengthen gates, add rationalization prevention |
| `plugins/.../references/codex-agents.md` | Add new agent types, review pipeline docs, timing |

### Key Decisions

- **Max 2 fix cycles** per review stage before escalating to user
- **Parallel per story** — reviews start as soon as each impl agent finishes, don't wait for batch
- **Final review** is a full changeset review (not test-only)
- **No git worktrees** — user manages branching manually
- **No CLI changes** — all changes are in skill instructions and prompt templates
- **Disciplines in templates.ts** — automatically injected, testable with `--dry-run`

### Agent Timing Budget

| Stage | Duration |
|-------|----------|
| Implementation | 20-40 min |
| Spec review | 10-20 min |
| Quality review | 10-20 min |
| Fix agent | 15-30 min |
| Final review | 15-30 min |
| **Total per story (no fixes)** | **40-80 min** |
| **Total per story (with fixes)** | **70-140 min** |

### Edge Cases

- **Implementation agent reports failure** — Skip review, attempt retry with modified prompt or escalate
- **Story has no testable acceptance criteria** — Skip spec review, go straight to quality review
- **Fix agent introduces new failures** — Caught by re-running the review; counts toward the 2-cycle limit
- **All stories in a batch escalate** — Report all failures to user, await guidance before next batch

## Testing Strategy

1. **Prompt verification**: `codex-agent start --type implementation "test" --dry-run` — verify disciplines block appears
2. **New type verification**: `codex-agent start --type spec-review "test" --dry-run` and `--type quality-review "test" --dry-run` — verify correct prompts
3. **Skill readability**: Manual read-through of each modified SKILL.md for clarity and unambiguity
4. **Health check**: `codex-agent health` — verify no CLI breakage
5. **End-to-end**: Run the full pipeline on a small feature to verify the review loops work correctly
