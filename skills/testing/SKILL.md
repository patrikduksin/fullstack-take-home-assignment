---
name: testing
description: Use whenever writing or adding tests, including unit, integration, and browser tests.
---

# Writing tests

Never write tautological tests or use mocks, stubs, fake services, or no-op layers. Each test must catch a plausible behavioral regression with an expected result independent of the implementation. Small input fixtures are fine. Do not add tests for constants, labels, getters, copied implementation logic, or coverage alone.

Choose the smallest test type that can catch the regression:

- Unit tests cover real algorithms, transformations, validation, and state transitions, including edge cases and failures. Keep them in the owning package's `test/` directory. Use Vitest and `@effect/vitest` where relevant. Do not invent unit tests for a package without meaningful logic.
- Integration tests cover behavior that depends on real persistence, service bindings, or HTTP/RPC/MCP transport. Keep them in the package that owns that behavior, such as `apps/backend/test/`. Reuse `apps/infra/test/stack.ts` and existing suites to test the deployed stack, including failure behavior and cleanup.
- Browser tests cover hydration, user interactions, navigation, and persistence visible after reload. Put web journeys in `apps/web/test/e2e/`. Reuse the existing Alchemy wrapper and E2E configuration. Use exact assertions for important outcomes; use agent actions or judgments when they help exercise the journey. Do not repeat API checks here.

Assert observable outcomes. If another test already catches the same regression, add a distinct case only when it contributes useful coverage. Follow the existing harness rather than creating another test setup, and keep teardown effective when assertions fail.
