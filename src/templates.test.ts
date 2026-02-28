import { describe, expect, it } from "bun:test";
import { buildPrompt } from "./templates.ts";

describe("buildPrompt", () => {
  it("injects disciplines for implementation prompts between Role and Context", () => {
    const prompt = buildPrompt({
      type: "implementation",
      task: "Implement story 2",
      jobId: "job-impl",
      designDoc: "docs/design.md",
      scope: ["src/templates.ts"],
    });

    const roleIndex = prompt.indexOf("## Role");
    const disciplinesIndex = prompt.indexOf("## Disciplines");
    const contextIndex = prompt.indexOf("## Context");
    const scopeIndex = prompt.indexOf("## Scope");
    const taskIndex = prompt.indexOf("## Task");

    expect(disciplinesIndex).toBeGreaterThan(roleIndex);
    expect(contextIndex).toBeGreaterThan(disciplinesIndex);
    expect(scopeIndex).toBeGreaterThan(contextIndex);
    expect(taskIndex).toBeGreaterThan(scopeIndex);
  });

  it("does not inject disciplines for non-implementation prompts", () => {
    const prompt = buildPrompt({
      type: "research",
      task: "Analyze templates",
      jobId: "job-research",
      designDoc: "docs/design.md",
    });

    expect(prompt).not.toContain("## Disciplines");
  });

  it("assembles spec-review prompt sections in the expected order", () => {
    const prompt = buildPrompt({
      type: "spec-review",
      task: "Review spec compliance",
      jobId: "job-spec-review",
      storyCriteria: "AC1: Role block is present",
      implementationReport: "Implemented role and sections.",
      changedFiles: ["src/templates.ts", "src/jobs.ts"],
      designDoc: "docs/design.md",
      prd: "docs/prd.md",
      files: ["src/templates.ts"],
    });

    const roleIndex = prompt.indexOf("## Role");
    const storySpecIndex = prompt.indexOf("## Story Spec");
    const implementationReportIndex = prompt.indexOf("## Implementation Report");
    const changedFilesIndex = prompt.indexOf("## Changed Files");
    const taskIndex = prompt.indexOf("## Task");

    expect(storySpecIndex).toBeGreaterThan(roleIndex);
    expect(implementationReportIndex).toBeGreaterThan(storySpecIndex);
    expect(changedFilesIndex).toBeGreaterThan(implementationReportIndex);
    expect(taskIndex).toBeGreaterThan(changedFilesIndex);

    expect(prompt).not.toContain("## Context");
    expect(prompt).not.toContain("## Disciplines");
  });

  it("assembles quality-review prompt sections in the expected order", () => {
    const prompt = buildPrompt({
      type: "quality-review",
      task: "Review implementation quality",
      jobId: "job-quality-review",
      implementationReport: "Added review sections and tests.",
      changedFiles: ["src/templates.ts"],
      designDoc: "docs/design.md",
      files: ["src/templates.ts"],
    });

    const roleIndex = prompt.indexOf("## Role");
    const implementationSummaryIndex = prompt.indexOf("## Implementation Summary");
    const changedFilesIndex = prompt.indexOf("## Changed Files");
    const taskIndex = prompt.indexOf("## Task");

    expect(implementationSummaryIndex).toBeGreaterThan(roleIndex);
    expect(changedFilesIndex).toBeGreaterThan(implementationSummaryIndex);
    expect(taskIndex).toBeGreaterThan(changedFilesIndex);

    expect(prompt).not.toContain("## Context");
    expect(prompt).not.toContain("## Disciplines");
  });

  it("omits missing optional sections for spec-review and quality-review", () => {
    const specPrompt = buildPrompt({
      type: "spec-review",
      task: "Review spec compliance",
      jobId: "job-spec-minimal",
    });
    const qualityPrompt = buildPrompt({
      type: "quality-review",
      task: "Review quality",
      jobId: "job-quality-minimal",
    });

    expect(specPrompt).not.toContain("## Story Spec");
    expect(specPrompt).not.toContain("## Implementation Report");
    expect(specPrompt).not.toContain("## Changed Files");
    expect(specPrompt).toContain("## Task");

    expect(qualityPrompt).not.toContain("## Implementation Summary");
    expect(qualityPrompt).not.toContain("## Changed Files");
    expect(qualityPrompt).toContain("## Task");
  });
});
