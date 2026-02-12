---
name: decompose
description: Convert a brainstorming design doc into a comprehensive PRD with phased user stories, dependency graphs, and acceptance criteria. Pure Claude work — no Codex agents needed. Output feeds directly into execute mode.
triggers:
  - decompose
  - codex decompose
  - create prd
  - break down design
---

# Decompose

Convert a design doc into a comprehensive PRD with phased user stories suitable for parallel execution by Codex agents.

**Announce at start:** "Using /decompose to convert the design doc into a PRD with user stories."

This is pure Claude work — no Codex agents needed.

## Step 1: Locate the Design Doc

Find the design doc:
1. If the user specified a path, use that
2. Otherwise, find the most recently committed file in `docs/plans/` matching `*-design.md`:
   ```bash
   git log --diff-filter=A --name-only --pretty=format: -- 'docs/plans/*-design.md' | head -1
   ```
3. If nothing found, ask the user for the path

Read the design doc thoroughly before proceeding.

## Step 2: Break Into User Stories

Analyze the design doc and decompose it into user stories.

**Rules:**
- Each story should be a self-contained unit of work that produces a clear deliverable. Size them so a Codex agent can complete one and move on — not so granular that coordination overhead outweighs the work.
- Stories execute in priority order. Dependencies MUST come first.
- A story that depends on 3 must have a higher priority number than 3.
- 30-50+ stories is normal for complex architectures. Don't artificially constrain the count.

**Organize stories into phases:**
1. **Phase 1: Foundation** — Schema, data models, configuration, infrastructure
2. **Phase 2: Core Logic** — Backend, API endpoints, core business logic
3. **Phase 3: UI Components** — Frontend components (if applicable)
4. **Phase 4: Integration** — Orchestration, wiring components together, workflows
5. **Phase 5: Polish** — Testing improvements, error handling, documentation

Not all phases apply to every project. Skip phases that don't fit.

**Declare dependencies between stories:**
- Reference by story ID (e.g., 3, 4)
- Phase 1 stories typically have no dependencies
- Phase 2+ stories depend on the Phase 1 stories they build upon
- Within a phase, order by dependency chain
- No circular dependencies — restructure to break cycles

**Parallel execution awareness:**
- Stories with no shared files and no dependency can run as separate Codex agents simultaneously
- Stories modifying the same files MUST be sequential
- Maximize parallelism by keeping stories independent where possible

## Step 3: Write Acceptance Criteria

Every story gets verifiable acceptance criteria.

**Rules:**
- Must be objectively verifiable by reading code and running tests
- Bad: "User can do X" (vague). Good: "Endpoint POST /api/users returns 201 with user object" (verifiable)
- Bad: "Works correctly" (unmeasurable). Good: "Function returns sorted array in ascending order" (testable)
- Every story MUST include "All tests pass" as an acceptance criterion
- If the design doc is ambiguous, make a reasonable choice and note it
- Limit to 8-10 acceptance criteria per story — more means the story is too large, split it

## Step 4: Derive Feature Name and Draft PRD

Derive the feature name from the design doc filename:
- `docs/plans/2026-02-05-enrichment-pipeline-design.md` → `enrichment-pipeline`
- Strip the path, date prefix, and `-design.md` suffix

Draft the full PRD using the output format below.

## Step 5: Present for Review and Incorporate Feedback

Show the user the full PRD draft. Ask for feedback and incorporate requested changes.

## Step 6: Save and Commit

After review feedback is incorporated, save the PRD to `docs/plans/prd-<feature-name>.md`.

Commit the PRD to git. Tell the user:

"PRD saved to `<path>`. Ready for execution.

To execute with Codex agents: `/execute`"

## Output Format

```markdown
# PRD: <Feature Name>

## Overview
<High-level description from design doc>

## Design Reference
Design doc: `<path to design doc>`

## User Stories

### Phase 1: Foundation

#### 1: <Title>
- **Description:** <What this story delivers>
- **Files:** <Files to create or modify>
- **Depends on:** none
- **Acceptance Criteria:**
  - Specific verifiable criterion
  - Another criterion
  - All tests pass

#### 2: <Title>
- **Description:** <What this story delivers>
- **Files:** <Files to create or modify>
- **Depends on:** 1
- **Acceptance Criteria:**
  - ...
  - All tests pass

### Phase 2: Core Logic
...

### Phase 3: UI Components
...

### Phase 4: Integration
...

### Phase 5: Polish
...

## Dependency Graph

### Parallel Batch 1 (no dependencies)
- Story 1, Story 2

### Parallel Batch 2 (depends on batch 1)
- Story 3, Story 4

### Sequential
- Story 5 (depends on 3, 4)

## Execution Notes
<Ordering, risk areas, or special considerations for execution>
```
