# Source provenance

Upstream: https://github.com/joelhooks/rat-stack Commit: c7d11aa396dad097ecb41a3f316cc905f6037063

Retained and adapted: capability contracts and HTTP/RPC/MCP projections, their tests, compiler diagnostics, lint plugins, anti-slop tooling, formatting configuration, Git hook policy, and source-mirror script.

New starter composition: health contract and database port, D1 adapter, backend composition, minimal TanStack Start app, infrastructure stack, and project documentation.

The upstream MIT license remains in LICENSE. Vendored anti-slop attribution remains in tools/oxlint/anti-slop/UPSTREAM.md.

Core skills in skills/ are adapted from the upstream add-a-capability, add-a-lifecycle-machine, learn-alchemy, and uncomplect skills at the commit above. They describe this project's current packages, interfaces, infrastructure, and verification commands. The upstream lifecycle demo template was replaced with a domain-oriented test guide. Skills CLI installs these maintained sources locally via pnpm skills:install; skills-lock.json records local source hashes. Reference-repo maintenance and website skills are omitted.

The setup-core skill was written for this project.
