---
name: brainstorm
description: Brainstorm ideas into fully formed designs through collaborative dialogue. Uses Codex research agents for deep codebase exploration while you discuss strategy with the user. Produces a design doc ready for decomposition.
triggers:
  - brainstorm
  - codex brainstorm
  - ideate
  - design session
---

# Brainstorm

Turn ideas into fully formed designs through collaborative dialogue. You (Claude) drive the conversation and design process. Codex agents handle all codebase research.

**Announce at start:** "Using /brainstorm to explore this idea and produce a design doc."

**Before proceeding, read the Codex agent reference:** `${CLAUDE_PLUGIN_ROOT}/references/codex-agents.md`

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Checklist

You MUST complete these steps in order:

1. **Explore project context** — spawn Codex research agents for deep exploration
2. **Ask clarifying questions** — one at a time, understand purpose/constraints/success criteria
3. **Propose 2-3 approaches** — with trade-offs and your recommendation
4. **Present design** — in sections scaled to their complexity, get user approval after each section
5. **Write design doc** — save to `docs/plans/YYYY-MM-DD-<topic>-design.md`
6. **Transition to decompose** — invoke the `decompose` skill to create PRD

## Step 1: Explore Project Context (Agent Teams)

Spawn Codex research agents **via agent teams** to understand the codebase before discussing with the user.

**When to spawn agents vs answer inline:**
- Quick factual question you already know → answer inline
- Exploring architecture, patterns, multiple files, dependencies → spawn Codex agents

**You are the team lead.** Create a team at the start of the brainstorm session, then spawn **teammates** (general-purpose Claude subagents) for each research task. Each teammate wraps exactly one Codex research session — it starts the agent, monitors it, and relays the result back to you.

### Setting up the team

Create a team once at the beginning of the brainstorm using `TeamCreate`. All research teammates join this team.

### Spawning research teammates

For each research question, spawn a teammate via the `Task` tool with `team_name` set to the team you created. Each teammate runs two commands sequentially:

**Step A — Start the Codex agent:**
```bash
codex-agent start --type research "Explore the project structure and identify key architectural patterns"
```

**Step B — Monitor until completion:**
```bash
codex-agent monitor <jobId>
```

**Step C — Relay result back:**
When monitor exits, the teammate sends a message to you (the team lead) via `SendMessage` with:
- The job ID
- The exit status (success or failure)
- The result file path: `/tmp/codex-agent/{jobId}-result.md`

### When teammates report findings

- Read the result file at `/tmp/codex-agent/{jobId}-result.md` for the full detailed output
- Synthesize findings — separate signal from noise
- Use the synthesis to inform your conversation with the user
- Do NOT dump raw agent output to the user — distill it

### The research loop

```
discuss with user → identify unknowns → spawn teammates → continue discussing →
teammates report back → read result files → synthesize findings → discuss informed by findings → repeat
```

You can have multiple research teammates running simultaneously while you talk with the user. Spawn new teammates anytime you identify additional unknowns during the conversation.

### Non-blocking status checks

For a quick non-blocking check on all agents without waiting:
```bash
codex-agent jobs --json
```

## Guidance: Wait vs Continue

- If the current discussion depends on pending agent findings, wait for those agents to complete before continuing. Do not get far ahead and let results arrive out of context.
- If agents are doing independent exploration and the user wants to discuss other aspects, continue the conversation while the agents run.
- If you are unsure whether the discussion depends on findings, default to waiting.

## Guidance: Task Sizing for Research Agents

- Prefer small, focused research tasks over broad "review everything" prompts.
- Smaller tasks typically complete in 5-10 minutes; broad tasks often take 15-20 minutes.
- Aim for 3-6 parallel research agents on focused scopes rather than 1-2 agents on broad scopes.
- Split broad prompts into concrete file/topic slices.
- Example split: instead of "Review the entire CLI implementation," run parallel tasks like "Review argument parsing in cli.ts", "Review job lifecycle in jobs.ts", and "Review tmux session management".

## Step 2: Ask Clarifying Questions

Ask questions one at a time to refine the idea.

- **One question per message** — do NOT overwhelm with multiple questions
- **Prefer multiple choice** when possible — easier to answer than open-ended
- Focus on understanding: purpose, constraints, success criteria
- If you discover unknowns during questioning, spawn more Codex research agents

## Step 3: Propose 2-3 Approaches

Once you understand the problem space:

- Propose 2-3 different approaches with trade-offs
- Lead with your recommended option and explain why
- Use findings from Codex research agents to ground proposals in the actual codebase

## Step 4: Present Design

Once you believe you understand what you're building:

- Present the design section by section
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- YAGNI ruthlessly — remove unnecessary features

## Step 5: Write Design Doc

After the user approves the design:

- Save to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- **Always tell the user the exact path.** Say: "Design doc saved to `<path>`."

```markdown
# [Feature Name] Design

## Problem
[What problem are we solving]

## Solution
[The approved approach]

## Architecture
[Components, data flow, dependencies]

## Implementation Notes
[Key decisions, constraints, edge cases]

## Testing Strategy
[How this will be verified]
```

## Step 6: Transition to Decompose

After saving the design doc, tell the user:

"Design doc saved to `<path>`. Transitioning to /decompose to create the PRD."

Then invoke the **decompose** skill to break it into a PRD with user stories. Do NOT invoke any other skill.

## Key Principles

- **One question at a time** — Don't overwhelm with multiple questions
- **Multiple choice preferred** — Easier to answer than open-ended when possible
- **YAGNI ruthlessly** — Remove unnecessary features from all designs
- **Explore alternatives** — Always propose 2-3 approaches before settling
- **Incremental validation** — Present design, get approval before moving on
- **Codex agents for research** — Don't read the codebase yourself; delegate to agents
- **Be flexible** — Go back and clarify when something doesn't make sense
