# Repo rules

Keep dependency versions pinned and never bypass Git hooks. Before handover, run `pnpm check` and `pnpm test`.

Before Effect work, read `node_modules/effect/AGENTS.md`.

Testing policy and workflow: [testing skill](skills/testing/SKILL.md).

Edit project skill sources in `skills/`, then run `pnpm skills:install`. Installed copies in `.agents/skills` are generated.

## Agent skills

- Issues and specs: GitHub Issues. See [issue tracker configuration](docs/agents/issue-tracker.md).
- Domain docs: root glossary and shared ADRs. See [domain documentation rules](docs/agents/domain.md).
