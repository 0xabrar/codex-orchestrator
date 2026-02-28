// Prompt templates for different Codex agent types

export type AgentType =
  | "research"
  | "implementation"
  | "review"
  | "test"
  | "spec-review"
  | "quality-review";

export interface PromptOptions {
  type: AgentType;
  task: string;
  jobId: string;
  files?: string[];
  designDoc?: string;
  prd?: string;
  scope?: string[];
  implementationReport?: string;
  storyCriteria?: string;
  changedFiles?: string[];
}

const roleDescriptions: Record<AgentType, string> = {
  research:
    "You are a research agent. Use workspace-write sandbox access for communication and output files. Focus on exploration: search the codebase, read files, and analyze patterns. Do not modify source files unless explicitly asked. Write findings to the comms file as you discover them. When finished, write your detailed findings to the result file and report completion.",
  implementation:
    "You are an implementation agent. Implement the task below. Write status updates as you work. When done, write a detailed summary of changes to the result file, then report completion with the result file path.",
  review:
    "You are a review agent. Perform code review for bugs, security issues, and code quality. Do not modify source files unless explicitly asked. Write findings to the comms file. When finished, write your full review to the result file and report completion.",
  test:
    "You are a test agent. Write and run tests for the specified code. Write status updates as you work. When done, write detailed test results to the result file, then report completion with the result file path.",
  "spec-review":
    "You are a spec compliance reviewer. Compare the implementation against the story spec and acceptance criteria. Read the actual code in the changed files and do not trust the implementation report by itself. Verify each acceptance criterion directly in code. Report PASS or FAIL for every criterion with specific file:line references. If any criterion fails, explain exactly what is missing or wrong.",
  "quality-review":
    "You are a code quality reviewer. Review the implementation for code quality, patterns, error handling, security, and test quality. Categorize issues as Critical, Important, or Minor and include file:line references for every issue. Acknowledge what was done well.",
};

const findingTypes: Set<AgentType> = new Set([
  "research",
  "review",
  "spec-review",
  "quality-review",
]);

export function buildDisciplinesBlock(): string {
  return `## Disciplines

### TDD (Test-Driven Development)
- Write a failing test first, before writing any implementation code.
- Run the test and verify it fails for the correct reason.
- Write the minimal code needed to make the test pass.
- Run the test again and verify it passes.
- Refactor while keeping tests green.
- If you wrote code without a test first, delete it and restart with a failing test.

### Verification Before Completion
- Run the full test suite before reporting done.
- Include complete test output in the result file.
- If any test fails, fix it before reporting done.
- Do not claim "should work" without running the tests and proving it.

### Systematic Debugging
- Find the root cause before fixing.
- Read errors carefully, including stack traces.
- Reproduce the issue consistently before attempting a fix.
- Form a single hypothesis and test it with the smallest possible change.
- If 3 or more fix attempts fail, report findings and investigation notes rather than guessing.`;
}

export function buildCommsBlock(jobId: string, type: AgentType, resultFilePath?: string): string {
  const resultFile = resultFilePath || `/tmp/codex-agent/${jobId}-result.md`;

  let block = `## Communication

You are a delegated Codex agent managed by an orchestrator. The orchestrator monitors your
progress through a JSONL comms file and collects your detailed output from a result file.
- Comms file: short status updates (read by the orchestrator in real time)
- Result file: ${resultFile} (write your detailed findings/output here before finishing)

Your job ID is: ${jobId}

Report your progress using these commands:

  codex-agent comms status ${jobId} "<what you are doing>"
    Run when starting a new phase of work.

  codex-agent comms done ${jobId} --file ${resultFile}
    Run when the task is complete. Write your detailed results to ${resultFile} first,
    then run this command. The orchestrator will read the file for your full output.

  codex-agent comms done ${jobId} "<summary of what you did>"
    Alternative: inline summary if no result file is needed.`;

  if (findingTypes.has(type)) {
    block += `

  codex-agent comms finding ${jobId} "<what you found>"
    Run when you discover something noteworthy.`;
  }

  return block;
}

export function buildPrompt(options: PromptOptions): string {
  const sections: string[] = [];
  const trimmedStoryCriteria = options.storyCriteria?.trim();
  const trimmedImplementationReport = options.implementationReport?.trim();

  // 1. Comms instructions
  const resultFilePath = `/tmp/codex-agent/${options.jobId}-result.md`;
  sections.push(buildCommsBlock(options.jobId, options.type, resultFilePath));

  // 2. Role description
  sections.push(`## Role\n\n${roleDescriptions[options.type]}`);

  if (options.type === "implementation") {
    sections.push(buildDisciplinesBlock());
  }

  if (options.type === "spec-review") {
    if (trimmedStoryCriteria) {
      sections.push(`## Story Spec\n\n${trimmedStoryCriteria}`);
    }
    if (trimmedImplementationReport) {
      sections.push(`## Implementation Report\n\n${trimmedImplementationReport}`);
    }
    if (options.changedFiles && options.changedFiles.length > 0) {
      sections.push(`## Changed Files\n\n${options.changedFiles.join("\n")}`);
    }

    sections.push(`## Task\n\n${options.task}`);
    return sections.join("\n\n");
  }

  if (options.type === "quality-review") {
    if (trimmedImplementationReport) {
      sections.push(`## Implementation Summary\n\n${trimmedImplementationReport}`);
    }
    if (options.changedFiles && options.changedFiles.length > 0) {
      sections.push(`## Changed Files\n\n${options.changedFiles.join("\n")}`);
    }

    sections.push(`## Task\n\n${options.task}`);
    return sections.join("\n\n");
  }

  // 3. Context references
  const contextLines: string[] = [];
  if (options.designDoc) {
    contextLines.push(`Read the design document at: ${options.designDoc}`);
  }
  if (options.prd) {
    contextLines.push(`Read the PRD at: ${options.prd}`);
  }
  if (options.files && options.files.length > 0) {
    contextLines.push(`Reference these files:\n${options.files.join("\n")}`);
  }
  if (contextLines.length > 0) {
    sections.push(`## Context\n\n${contextLines.join("\n\n")}`);
  }

  // 4. Scope rules (implementation only)
  if (options.type === "implementation" && options.scope && options.scope.length > 0) {
    sections.push(
      `## Scope\n\nYou own these files — only modify files in this list:\n${options.scope.join("\n")}\nDo not modify files outside your scope.`
    );
  }

  // 5. Task
  sections.push(`## Task\n\n${options.task}`);

  return sections.join("\n\n");
}
