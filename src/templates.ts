// Prompt templates for different Codex agent types

export type AgentType = "research" | "implementation" | "review" | "test";

export interface PromptOptions {
  type: AgentType;
  task: string;
  jobId: string;
  files?: string[];
  designDoc?: string;
  prd?: string;
  scope?: string[];
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
};

const findingTypes: Set<AgentType> = new Set(["research", "review"]);

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

  // 1. Comms instructions
  const resultFilePath = `/tmp/codex-agent/${options.jobId}-result.md`;
  sections.push(buildCommsBlock(options.jobId, options.type, resultFilePath));

  // 2. Role description
  sections.push(`## Role\n\n${roleDescriptions[options.type]}`);

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
