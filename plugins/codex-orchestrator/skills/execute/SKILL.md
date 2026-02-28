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

You are the **team lead**. You spawn **teammates** (general-purpose Claude subagents), each of which wraps exactly one Codex session (`codex-agent start` + `codex-agent monitor`) and relays status via `SendMessage`.

### 1. Read the PRD and dependency graph

Understand stories, acceptance criteria, and batch dependencies.

### 2. Start implementation teammates for the first unblocked batch

For each unblocked story, spawn one implementation teammate.

```bash
codex-agent start --type implementation "Implement Story 1: [title]. [description]. Acceptance criteria: [criteria]." -f "docs/plans/design.md" -f "docs/plans/prd-feature.md"
codex-agent monitor <implJobId>
```

### 3. As each implementation finishes, immediately start that story's review pipeline

Do not wait for the full batch. Review is **parallel per story**: as soon as an implementation result arrives, start its spec review pipeline while other implementation agents continue running.

**Per-story pipeline (mandatory):**

```text
Implementation done
  -> Spec review
    -> (if FAIL) Spec fix loop (max 2 cycles), then re-run spec review
  -> Quality review
    -> (if Critical issues) Quality fix loop (max 2 cycles), then re-run quality review
  -> Story DONE only after spec PASS + quality PASS (no Critical issues)
```

### 4. Information flow between stages (orchestrator as memory)

Agents do not communicate directly. You pass context forward:

1. Read implementation result file: `/tmp/codex-agent/{implJobId}-result.md`
2. Paste relevant implementation details into the spec-review prompt
3. Read spec-review result file and, if failing, paste failures + implementation context into a fix prompt
4. Re-run spec review with updated implementation result
5. After spec passes, run quality review using implementation result + changed files
6. If quality has Critical issues, paste quality findings + implementation context into a fix prompt, then re-run quality review

### 5. Concrete review/fix command examples

Use these patterns when building teammate commands.

**Spec-review agent:**
```bash
impl_job="<implJobId>"
impl_report="$(cat /tmp/codex-agent/${impl_job}-result.md)"

codex-agent start --type spec-review "Story: Story 4 - Add multi-stage review pipeline.
Acceptance criteria:
- [criterion 1]
- [criterion 2]
- [criterion 3]

Implementation report from ${impl_job}:
${impl_report}

Changed files:
- plugins/codex-orchestrator/skills/execute/SKILL.md

Review every acceptance criterion against the ACTUAL code.
Return PASS/FAIL per criterion with file:line evidence." -f "docs/plans/prd-superpowers-disciplines.md"
codex-agent monitor <specReviewJobId>
```

**Quality-review agent:**
```bash
impl_job="<implJobId>"
impl_report="$(cat /tmp/codex-agent/${impl_job}-result.md)"

codex-agent start --type quality-review "Review Story 4 implementation quality.
Implementation summary:
${impl_report}

Changed files:
- plugins/codex-orchestrator/skills/execute/SKILL.md

Categorize findings as Critical, Important, Minor.
Include file:line references for every issue." -f "docs/plans/prd-superpowers-disciplines.md"
codex-agent monitor <qualityReviewJobId>
```

**Fix agent (used for spec failures and quality issues):**
```bash
impl_job="<implJobId>"
review_job="<reviewJobId>"
impl_report="$(cat /tmp/codex-agent/${impl_job}-result.md)"
review_findings="$(cat /tmp/codex-agent/${review_job}-result.md)"

codex-agent start --type implementation "Fix Story 4 issues from review.
Story acceptance criteria:
- [criterion list]

Current implementation report:
${impl_report}

Review findings to resolve:
${review_findings}

Apply minimal changes, run tests, and update the story result with what changed." -f "docs/plans/prd-superpowers-disciplines.md"
codex-agent monitor <fixJobId>
```

### 6. Review cycle limits and escalation

Each review stage has a hard cap of **2 fix cycles**:

- Spec stage: spec review -> fix -> spec review -> fix -> spec review (final)
- Quality stage: quality review -> fix -> quality review -> fix -> quality review (final)

If the story still fails that stage after 2 fix cycles:

- Stop that story's pipeline
- Mark it escalated
- Report unresolved issues and reviewer evidence to the user
- Continue other stories independently

### 7. Teammate wrapping rules

Every review and fix run also gets a dedicated Claude teammate, exactly like implementation runs:

- 1 teammate for each `spec-review` job
- 1 teammate for each `quality-review` job
- 1 teammate for each fix job (`--type implementation`)

Each teammate performs `codex-agent start`, then `codex-agent monitor`, then sends back job ID, exit status, and result file path.

### 8. Batch progression and done criteria

- A story is **done** only after it passes both review stages (spec PASS and quality PASS with no Critical issues)
- A batch is complete only when every story in that batch is done or escalated
- Only then start newly unblocked stories in the next batch

### 9. Final review after all batches

After all batches finish (done or escalated), spawn one full changeset review agent to catch cross-story integration issues and architecture inconsistencies.

```bash
codex-agent start --type review "Review the full changeset across all completed stories. Focus on cross-story regressions, integration issues, architectural consistency, and missed edge cases. Provide prioritized findings with file:line references." -f "docs/plans/prd-superpowers-disciplines.md"
codex-agent monitor <finalReviewJobId>
```

### 10. Timing expectations

- Implementation agent: 20-40 min per story
- Spec-review agent: 10-20 min
- Quality-review agent: 10-20 min
- Fix agent: 15-30 min per cycle
- Final review agent: 15-30 min

### 11. Report progress

Summarize key outcomes for the user. Distill the signal from result files; do not paste raw multi-page output.

## Story-to-Agent Mapping

- One implementation Codex agent per story (default)
- Include the design doc and PRD as file context for every agent
- Write clear prompts: story title, description, acceptance criteria
- Start review pipeline immediately when each implementation result arrives
- A story is not done until it passes both spec and quality review stages
- Each agent writes detailed output to `/tmp/codex-agent/{jobId}-result.md`

## When NOT to Use This Pipeline

Basically never. Codex agents are the default for all execution work.

**The ONLY exceptions:**
- The user explicitly says "you do it" or "don't use Codex"
- Pure conversation/discussion (no code, no files)
- Quick single-file read for conversational context

**Everything else goes to Codex agents** — including "simple" changes and "quick" fixes. Your job is orchestration, not implementation.
