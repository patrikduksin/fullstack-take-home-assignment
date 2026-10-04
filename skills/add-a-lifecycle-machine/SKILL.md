---
name: add-a-lifecycle-machine
description: Add a Core domain lifecycle using XState for states and events and Effect for actors, typed failures, services, and cleanup.
---

# Add a lifecycle machine

Use a machine when the domain has meaningful legal transitions, cancellation, retries, or deadlines. Keep a direct Effect for work whose states add no domain value.

Read `AGENTS.md`, the installed Effect `AGENTS.md`, and the pinned XState and `@xstate/effect` source before implementing a lifecycle. Source mirrors can be prepared with `pnpm vendor:agent-sources`. This starter has no example domain machine; do not look for the upstream file-inspection demo.

## States, work, and outcomes

Name legal states, events, and final outcomes before writing the machine. Model expected domain failures as typed final outcomes when they represent a legal ending. Reserve defects for impossible states or unexpected machine failures.

Define side-effect actors with `fromEffect` outside the machine and declare them through `setupEffect`. Give actors input schemas and typed service requirements. Use the pinned bridge's `types` helper when declaring context types; check its current API in source.

XState owns transitions and lifecycle context. Effect actors own database/provider work, typed errors, resource scopes, and cleanup. Avoid inline Effect callbacks in machine definitions. Keep provider details in adapters and invoke core service ports from actors.

Use explicit tagged outcome unions so success and expected failure preserve their values. A final state must produce its promised outcome; an absent result is a defect, not a default success.

## Run and compose

Start actors with `createEffectActor` from `@xstate/effect`, not XState's `createActor`. Observe them with `watchActor` from `@core/capability/actor-watch` and await `join` inside `Effect.scoped`. Observation is a no-op unless a `CallWatch` service is supplied; there is no devtools app to install or invoke.

The bridge exposes an unknown machine-error channel for `join`. Keep expected failures in the final outcome and turn unexpected machine failures into defects with `Effect.orDie`. If compiler diagnostics require an override, scope it to that expression and explain the boundary. Return the successful value or yield the typed failure from the outcome.

Call the runner from the capability handler and provide service Layers in the backend composition. Do not introduce a second runtime entrypoint for the machine.

## Test the lifecycle contract

Read [the lifecycle test guide](templates/lifecycle.model.test.md) when adding machine tests. Use `@effect/vitest` and schema-derived generators from `effect/Arbitrary`. Test legal endings, input forwarding, outcome preservation, and cleanup or cancellation where relevant.

For nontrivial event histories, compare actor behavior with an independent domain model. Use a `Deferred` service fake to control actual child completion; synthetic child-done events do not prove runtime work completed. Graph traversal from `xstate/graph` can cover legal transitions but does not replace real actor tests. Use `TestClock.adjust` for deadlines instead of wall-clock sleeps.

Keep the XState/Effect lint rules. Run `pnpm check`, `pnpm test`, and `pnpm build`.
