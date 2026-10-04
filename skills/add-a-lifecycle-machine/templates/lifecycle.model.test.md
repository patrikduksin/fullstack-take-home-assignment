# Lifecycle test guide

Use this guide when implementing a domain machine. The upstream file-inspection demo is not part of Core; write tests for the actual assignment lifecycle.

## Independent model

Describe expected behavior without calling the machine to compute expected results. For a single-work lifecycle, the model can be pending until the first completion, then hold one immutable success or typed failure. For a richer lifecycle, model legal domain events, cancellation, retries, and deadlines explicitly.

Derive generated input and output values from domain schemas with `effect/Arbitrary`. Generate command histories for transitions whose combinations matter. Assert invariants after each meaningful step, including preservation of input and result values and rejection of illegal transitions.

## Pure graph and real actor

Use `getShortestPaths` from `xstate/graph` to cover legal endings. Use `getPathsFromEvents` for generated histories where useful. These exports follow the installed XState pin; do not add a separate graph package. Pure graph tests may use synthetic child outcomes, but stop traversal at a terminal outcome where interpreter behavior differs from pure transitions.

Run corresponding histories against `createEffectActor` inside `Effect.scoped`. Supply a fake core service whose work awaits a `Deferred`. Complete the Deferred with a real success or typed failure and wait for the actor's expected state. Do not simulate child completion by sending an internal done event to a running actor.

Check that the service receives the right input and runs the expected number of times. Check the final output and the runner's typed error channel. Where the lifecycle promises terminal immutability, deliver further legal external commands and verify no output change or additional work. Where cancellation matters, verify the scoped work is interrupted and resources are released.

## Time and test quality

Use `it.effect` or `it.effect.prop` from `@effect/vitest` and `TestClock.adjust` from `effect/testing` for deadlines and retry intervals. Coordinate service startup before advancing virtual time. Check before, at, and after a domain deadline; avoid wall-clock sleeps.

Choose properties that would catch a realistic implementation error. If confidence in a property is uncertain, temporarily introduce that error in an isolated change, confirm the property fails, and restore it. Keep replay information when it helps diagnose a generated failure. Model tests supplement focused handler and service tests rather than asserting implementation details.
