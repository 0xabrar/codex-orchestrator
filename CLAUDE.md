# Codex Orchestrator

CLI tool for delegating tasks to GPT Codex agents via tmux sessions. Designed for Claude Code orchestration with bidirectional communication.

**Stack**: TypeScript, Bun, tmux, OpenAI Codex CLI

**Structure**: Shell wrapper -> CLI entry point -> Job management -> tmux sessions

## Development

```bash
# Run directly
bun run src/cli.ts --help

# Or via shell wrapper
./bin/codex-agent --help

# Health check
bun run src/cli.ts health
```

## Key Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI commands and argument parsing |
| `src/jobs.ts` | Job lifecycle and persistence |
| `src/tmux.ts` | tmux session management |
| `src/config.ts` | Configuration constants |
| `src/comms.ts` | Agent communication system (JSONL comms) |
| `src/files.ts` | File loading for context injection |
| `src/session-parser.ts` | Parses Codex session files; used by `jobs --json` to derive metadata |
| `plugins/` | Claude Code plugin (marketplace structure) |

## Plugin Structure

This repo doubles as a Claude Code plugin marketplace:

```
.claude-plugin/marketplace.json     # marketplace registry
plugins/codex-orchestrator/         # the plugin
  .claude-plugin/plugin.json        # plugin metadata
  skills/brainstorm/                # research-oriented planning skill
    SKILL.md
  skills/decompose/                 # PRD decomposition skill
    SKILL.md
  skills/execute/                   # implementation orchestration skill
    SKILL.md
  scripts/install.sh                # dependency installer
```

## Dependencies

- **Runtime**: Bun, tmux, codex CLI
- **NPM**: glob (file matching)

## Notes

- Jobs stored in `~/.codex-agent/jobs/`
- Output logging/capture is done via tmux pane history capture
- Completion detected via marker string in output
- Bun is the TypeScript runtime - never use npm/yarn/pnpm for running
