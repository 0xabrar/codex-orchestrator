# PRD: Superpowers Disciplines

## Overview

Enrich the codex-orchestrator with quality disciplines adapted from the superpowers plugin. TDD, verification-before-completion, and systematic debugging get baked into implementation agent prompts via `src/templates.ts`. A multi-stage review pipeline (spec compliance → code quality, with fix loops) gets added to the execute skill. The brainstorm skill gets harder enforcement gates. The codex-agents reference gets updated with new agent types and review pipeline documentation.

## Design Reference

Design doc: `docs/plans/2026-02-28-superpowers-disciplines-design.md`

## User Stories

### Phase 1: Foundation

#### 1: Add disciplines block, new agent types, and review prompt options to templates.ts
- **Description:** As a developer, I want `src/templates.ts` to have a `buildDisciplinesBlock()` function, two new agent types (`spec-review`, `quality-review`) with role descriptions, and new `PromptOptions` fields for review context, so that the prompt builder has all the building blocks for the enhanced pipeline.
- **Files:** `src/templates.ts`
- **Depends on:** none
- **Acceptance Criteria:**
  - `buildDisciplinesBlock()` function exists and returns a markdown string
  - Disciplines string contains TDD section: write failing test first, verify it fails, write minimal code, verify it passes, refactor, delete code written without a test
  - Disciplines string contains verification section: run full test suite before reporting done, include test output in result file, no "should work" claims
  - Disciplines string contains debugging section: find root cause before fixing, read errors carefully, reproduce consistently, single hypothesis, 3+ failures means report rather than guess
  - `AgentType` union includes `"spec-review"` and `"quality-review"`
  - `roleDescriptions` has entries for both new types
  - `spec-review` role instructs agent to read actual code, verify each acceptance criterion, report PASS/FAIL with file:line references
  - `quality-review` role instructs agent to categorize issues as Critical/Important/Minor with file:line references
  - Both new types are in the `findingTypes` set
  - `PromptOptions` interface includes `implementationReport?: string`, `storyCriteria?: string`, and `changedFiles?: string[]`
  - All tests pass

### Phase 2: Core Logic

#### 2: Inject disciplines and build review prompt assembly in templates.ts
- **Description:** As a developer, I want `buildPrompt()` to inject the disciplines block into implementation prompts and assemble correct prompts for spec-review and quality-review agents, so that every agent type gets the right prompt structure.
- **Files:** `src/templates.ts`
- **Depends on:** 1
- **Acceptance Criteria:**
  - `buildPrompt()` with `type: "implementation"` includes disciplines block between Role and Context sections
  - `buildPrompt()` with non-implementation types does NOT include the disciplines block
  - `buildPrompt()` with `type: "spec-review"` assembles: Comms → Role → Story Spec (from `storyCriteria`) → Implementation Report (from `implementationReport`) → Changed Files (from `changedFiles`) → Task
  - `buildPrompt()` with `type: "quality-review"` assembles: Comms → Role → Implementation Summary (from `implementationReport`) → Changed Files (from `changedFiles`) → Task
  - Missing optional fields are omitted gracefully (no empty sections)
  - `codex-agent start --type implementation "test" --dry-run` shows disciplines block
  - `codex-agent start --type spec-review "test" --dry-run` produces correct structure
  - `codex-agent start --type quality-review "test" --dry-run` produces correct structure
  - All tests pass

#### 3: Register new agent types in CLI argument parsing
- **Description:** As a developer, I want the CLI to accept `spec-review` and `quality-review` as valid `--type` values, so that the new agent types can be spawned from the command line.
- **Files:** `src/cli.ts`
- **Depends on:** 1
- **Acceptance Criteria:**
  - `codex-agent start --type spec-review "test prompt" --dry-run` produces valid output
  - `codex-agent start --type quality-review "test prompt" --dry-run` produces valid output
  - Invalid types like `--type foobar` still produce an error
  - All tests pass

### Phase 3: Skill Documents

#### 4: Add multi-stage review pipeline to execute skill
- **Description:** As an orchestrator, I want the execute SKILL.md to include a per-story review pipeline with spec review, quality review, fix loops, timing expectations, and concrete prompt examples, so that Claude follows the enhanced quality process when executing PRDs.
- **Files:** `plugins/codex-orchestrator/skills/execute/SKILL.md`
- **Depends on:** 2, 3
- **Acceptance Criteria:**
  - Includes new steps for: spec compliance review, fix agent for spec failures, code quality review, fix agent for quality issues
  - Specifies max 2 fix cycles per review stage before escalating to user
  - Specifies parallel-per-story: start reviewing each story as soon as its impl agent finishes
  - Explains information flow: orchestrator reads result.md, pastes contents into next agent's prompt
  - Includes teammate wrapping: each review/fix agent gets a Claude teammate
  - Defines "done": a story is done only after passing both reviews
  - Includes final review: spawn full changeset review agent after all batches complete
  - Escalation: if 2 fix cycles fail, stop that story and report to user
  - Includes timing section: spec review 10-20 min, quality review 10-20 min, fix agent 15-30 min, final review 15-30 min
  - Includes concrete `codex-agent start` examples for spec-review, quality-review, and fix agents showing how to pass context
  - All tests pass

#### 5: Strengthen brainstorm skill gates
- **Description:** As an orchestrator, I want the brainstorm SKILL.md to have stronger enforcement language, rationalization prevention, and explicit gates between steps, so that Claude reliably follows the full brainstorm process.
- **Files:** `plugins/codex-orchestrator/skills/brainstorm/SKILL.md`
- **Depends on:** none
- **Acceptance Criteria:**
  - Includes rationalization prevention section with red flags: "This is too simple", "Let me just code this quickly", "I'll design as I go", "The user already knows what they want", "I already understand the codebase"
  - Each checklist step has explicit gate language: "Do NOT proceed to step N+1 until step N is complete and approved"
  - The 6 checklist items are framed as mandatory tasks
  - Existing content and structure is preserved
  - All tests pass

#### 6: Update codex-agents reference with new types and review pipeline
- **Description:** As an orchestrator, I want the codex-agents reference to document the new agent types, review pipeline, timing, and information flow, so that Claude has complete reference material.
- **Files:** `plugins/codex-orchestrator/references/codex-agents.md`
- **Depends on:** 3
- **Acceptance Criteria:**
  - `--type` documentation includes `spec-review` and `quality-review` with descriptions
  - Flags table includes the new types
  - New "Review Pipeline" section explains the multi-stage flow
  - Agent timing table includes: spec review 10-20 min, quality review 10-20 min, fix agent 15-30 min
  - Information flow guidance explains passing context between agents via result files
  - All tests pass

## Dependency Graph

### Parallel Batch 1 (no dependencies)
- Story 1 (templates.ts foundation)
- Story 5 (brainstorm strengthening)

### Parallel Batch 2 (depends on batch 1)
- Story 2 (prompt assembly — depends on 1, modifies templates.ts)
- Story 3 (CLI arg parsing — depends on 1, modifies cli.ts)

### Parallel Batch 3 (depends on batch 2)
- Story 4 (execute skill pipeline — depends on 2, 3)
- Story 6 (codex-agents reference — depends on 3)

## Execution Notes

- No two stories in any parallel batch modify the same file
- Story 5 (brainstorm) is completely independent — can run in any batch
- Stories 1 and 2 are sequential on `src/templates.ts` — 1 adds types/functions, 2 wires them into `buildPrompt()`
- Story 4 is the largest story — it adds significant content to the execute skill including pipeline steps, timing, and examples
- All skill document stories (4, 5, 6) touch different files and cannot conflict
