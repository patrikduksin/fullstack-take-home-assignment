# Issue tracker: GitHub

Issues and specs live in GitHub Issues for patrikduksin/fullstack-take-home-assignment. Use the gh CLI.

Infer the repository from the Git remote. Read tickets with `gh issue view <number> --comments`; list them with `gh issue list`. Publishing a ticket means creating a GitHub issue. Use `--body-file` for multiline issue bodies and comments.

Use gh issue commands to comment, label, assign, edit, and close tickets when requested by the user or the invoked skill.

PRs as a request surface: no.

For wayfinding, use a `wayfinder:map` issue with child tickets labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. Prefer native sub-issues and issue dependencies. When unavailable, use a task list in the map, `Part of #<map>` in children, and `Blocked by: #<number>` for dependencies.
