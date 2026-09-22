# Second Brain Agent Rules

This repository is the implementation of a shared, local-first work memory hub. The data itself lives in `~/.secondbrain/brain.db`, so agents working in other repositories can access it without opening this repository.

When operating in any project:

1. Before meaningful work, query `secondbrain context --json` or the MCP `project_context` tool.
2. Search cross-project memories before inventing a solution for a familiar problem.
3. After meaningful work, capture a concise memory using `secondbrain auto-capture --agent <agent-name>` or MCP `create_memory`.
4. Include problem, root cause, solution, verification, changed files, project, technologies, and agent name when available.
5. Never send `.env`, keys, tokens, passwords, private certificates, or sensitive customer data to the memory system.
