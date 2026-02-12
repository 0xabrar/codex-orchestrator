# Codex Orchestrator - Claude Code Plugin

A Claude Code plugin that lets Claude orchestrate OpenAI Codex agents. Claude handles strategy and synthesis while Codex agents handle deep coding work in parallel tmux sessions, communicating progress via JSONL comms files.

## What It Does

When installed, Claude gains the ability to:

- **Spawn Codex agents** for research, implementation, review, and testing
- **Monitor agent progress** via JSONL comms files written by each agent
- **Redirect agents mid-task** when they need course correction
- **Synthesize findings** from multiple parallel agents into clear results
- **Follow a structured workflow**: Brainstorm -> Decompose -> Execute

You describe what you want. Claude explores the problem with research agents, decomposes it into a PRD with user stories and a dependency graph, then executes implementation in parallel -- all while monitoring agents through real-time comms.

## Installation

### Via Plugin Marketplace

```
/plugin marketplace add 0xabrar/codex-orchestrator
/plugin install codex-orchestrator
```

After install, run the setup script to install the CLI and all dependencies:

```bash
bash plugins/codex-orchestrator/scripts/install.sh
```

### Manual

Clone and install:

```bash
git clone https://github.com/0xabrar/codex-orchestrator.git ~/.codex-orchestrator
cd ~/.codex-orchestrator && bun install
export PATH="$HOME/.codex-orchestrator/bin:$PATH"  # add to ~/.bashrc or ~/.zshrc
```

## Usage

The plugin provides three modes:

```
/brainstorm   # explore problem, spawn research agents
/decompose    # create PRD from design doc
/execute      # parallel implementation from PRD
```

- **Brainstorm**: Interactive exploration of the problem space. Claude spawns research agents that investigate different angles and report findings via JSONL comms files.
- **Decompose**: Claude creates a PRD with user stories and a dependency graph, defining what needs to be built and in what order.
- **Execute**: Parallel implementation driven by the PRD. Claude spawns coding agents, monitors comms files for completion, and synthesizes the results.

## Comms System

Agents write JSONL updates to `/tmp/codex-agent/{jobId}.jsonl`. Claude watches these files in real-time to track progress, detect completion, and coordinate across parallel agents.

## Agent Timing

Codex agents take time -- this is normal and expected:

| Task Type | Typical Duration |
|-----------|------------------|
| Simple research | 10-20 minutes |
| Single feature | 20-40 minutes |
| Complex implementation | 30-60+ minutes |

## CLI Reference

The plugin uses the `codex-agent` CLI under the hood:

```bash
codex-agent start "task"                               # spawn agent
codex-agent jobs --json                                # check all job statuses
codex-agent send <id> "new instructions"               # redirect
codex-agent kill <id>                                  # stop (last resort)
```

See the [main README](../../README.md) for full CLI documentation.

## License

MIT
