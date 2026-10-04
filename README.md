# Funnel runtime

A configuration-driven fictional trail and camp planning demo built with TanStack Start, React, Effect, Cloudflare Workers, and D1. Visitors can answer questions, follow conditional routes, go Back, and resume saved progress. Internal pages publish immutable configurations and compare version, variant, and campaign metrics.

The assignment JSON files were not supplied. The files under `configurations/` are authored fictional replacements. They demonstrate the required behavior and do not represent booking, financial offers, or real customer data.

Public website: [Funnel Runtime](https://tha2.app).

The generated demo cohorts contain **120 sessions, 56 reaching results, and 40 CTA clickers**. Open the [Explore cohort](https://tha2.app/internal/analytics?campaign=traffic-1791106411327-20261004-explore) for 80 / 32 / 24, or the [Direct cohort](https://tha2.app/internal/analytics?campaign=traffic-1791106411327-20261004-direct) for 40 / 24 / 16. Browser verification sessions are also present in the unfiltered dashboard.

Repository: [patrikduksin/fullstack-take-home-assignment](https://github.com/patrikduksin/fullstack-take-home-assignment).

On the website, `/` opens the funnel, `/internal/versions` manages publication and rollback, `/internal/analytics` shows the dashboard, and `/health` checks the backend and database. Internal management is unauthenticated within this demonstration's scope.

## Run locally

The repository pins Node 24.18.0 and pnpm 11.3.0 through `.mise.toml` and the package manifest.

```sh
mise run setup
mise exec -- pnpm dev
```

Setup installs the pinned tools, frozen workspace dependencies, project skills, and Chromium. With mise activated, subsequent commands can use `pnpm` directly; otherwise prefix them with `mise exec --`.

Alchemy starts the website, backend Worker, and local D1 database and prints `websiteUrl` and `backendUrl`. Use the website URL for the visitor and operator flows. Local state persists in `.alchemy/`; local development creates no cloud resources. The website reaches the backend through a Cloudflare service binding in both development and deployment.

## Sessions, routes, and variants

The backend creates a session with the active immutable version and a stable A or B assignment, using a proposed equal split. `/?variant=A` and `/?variant=B` select the variant for a new session. A saved session retains its assignment when the URL changes; use **Start new session** to create the query-selected variant. Other variant values produce a validation error.

The browser retains the session identifier and unsubmitted edits in site storage. The backend retains accepted answers, current screen, visited history, version, variant, initial attribution, and route revision. Reload and reopening restore the same session within the same browser profile and retained site storage. Cross-device recovery is outside this exercise.

Navigation uses the eligible route rather than every configured screen. Conditions support `equals`, `includes`, `gte`, and `lte` over typed answers, with an explicit default for unresolved conditions. Back preserves eligible answers. Changing a branch answer removes answers and history for screens that are no longer eligible. A route revision changes only when the eligible screens or their order change. The server rejects invalid answers and stale navigation from a screen that is no longer current.

The proposed experiment hypothesis is that B's shorter route and clearer result CTA improve result reach per started session. Result reach is primary; CTA CTR among result viewers is secondary. Synthetic traffic verifies behavior and calculations; it does not establish experiment significance.

## Configuration and publication

| File | Role |
| --- | --- |
| `configurations/linear-v1.json` | Initial incremental linear fixture |
| `configurations/variants-v1.json` | Incremental B wording and ordering fixture |
| `configurations/iteration-one/trail.json` | Seven screens, active-pace supplies branch, A/B content |
| `configurations/iteration-one/camp.json` | Seven screens, waterside branch, A/B content |
| `configurations/iteration-two/trail.json` | Eight base screens, hours-based rest branch, actual B preparation removal, declared completion event |

Upload a local JSON file at `/internal/versions`. Each publication requires a new configuration ID. Validation checks supported screen types, stable IDs, answer options and bounds, results and CTAs, transitions, conditions, variants, and event declarations. The base definition and each resolved variant must have at least six configured screens and valid routes to results. Invalid definitions and repeated IDs leave the active version and activation history unchanged.

Variant overrides can change content, start, and navigation. `removeSteps` removes named screens from that variant's resolved configuration. Removed IDs must be known and unique; a variant cannot also override a screen it removes. Authors must explicitly bypass removed screens. Broken incoming destinations, removed starts, too few screens, and retained event declarations referencing removed screens fail validation.

Publication stores the version and activation atomically. New sessions use the active version; existing sessions retain their original definition and position. Rollback activates the preceding activation's target and appends history without deleting either configuration or its sessions. Repeated rollback follows the preceding target, including a preceding rollback. Historical versions and events remain queryable.

The second fictional fixture adds `hours >= 4` routing to a rest screen. A retains preparation; B removes it from both its configuration and route. The new `information_acknowledged` declaration uses the existing generic completion-emission path. Publishing that data needs no database schema change or renderer branch for the new event name.

## Events and durable delivery

The server records one `session_started` event atomically when it creates a session. Resume creates no additional start. Initial attribution captures `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, and `utm_content`; later URLs do not overwrite it.

Every stored envelope contains `eventId`, `type`, `sessionId`, `clientTimestamp`, `serverTimestamp`, pinned `version` and `variant`, nullable `stepId`, `utm`, and non-sensitive `properties`. The server verifies session metadata, configured step references, and the properties allowed for that event type. Accepted answer values stay in session state and never enter analytics envelopes.

| Built-in event | Meaning and additional client properties |
| --- | --- |
| `session_started` | Server-owned session creation |
| `step_viewed` | A displayed screen, with `routeRevision` |
| `answer_submitted` | Accepted question submission, with `routeRevision`, without its answer |
| `step_completed` | Accepted progress, with `routeRevision` and resolved `nextStepId` |
| `back_clicked` | Accepted Back, with `routeRevision` and `targetStepId` |
| `result_viewed` | A displayed result, with `routeRevision` |
| `cta_clicked` | The actual result CTA interaction, with `routeRevision` |

`POST /api/events` accepts `{ "events": [...] }` with 1–100 entries. Every entry gets an indexed `accepted`, `duplicate`, or `rejected` receipt. Malformed neighbors do not discard valid entries. Replaying the same ID and content preserves the original event and server timestamp. Reusing an ID with different validated content rejects the conflict. A persistence failure fails the request so the client can replay the same IDs.

The browser saves each envelope under `funnel-event:pending:<eventId>` before delivery. IDs, client times, attribution, and pinned metadata remain stable across retries. An Effect worker sends batches of up to 20, retries every second, and uses a 30-second request deadline. Leaving the funnel stops that worker; saved pending events remain available on reopening. Accepted and duplicate receipts remove only the captured keys, preserving events queued while a request was in flight. Permanent rejection or a corrupt saved record leaves the pending queue and adds metadata to a bounded journal of the latest 20 rejections, without retaining payload properties or answers.

Additional `eventTypes` belong to their configuration version. Properties support fixed booleans, enumerated values, and configured step references. Declarations restrict emitting screens; free text, sensitive names, unknown screens, duplicates, and built-in-name overrides fail validation. `on: "step_completed"` can emit a fixed boolean, a listed enum value, or a `"source"`/`"target"` step reference. Older pinned sessions retain their original declaration set.

`GET /api/sessions/:id/events` returns immutable envelopes without session answers. Completion validation accepts the pinned configuration's possible branch and default destinations, including delayed earlier-revision events, rather than reconstructing them from current answers.

## Analytics definitions

The dashboard and `GET /api/analytics` filter by optional `version`, `variant`, and initial `campaign`. An empty campaign selects sessions without an initial campaign. Cohorts keep version-specific screens and eligible transitions separate, including A/B comparisons.

Let each set contain distinct session IDs within the selected cohort:

| Metric | Definition |
| --- | --- |
| Started | Sessions with `session_started` |
| Result reach | Started sessions with `result_viewed`, divided by started sessions |
| CTA CTR | Result-viewing sessions with `cta_clicked`, divided by result-viewing sessions |
| Step completion | Step viewers with `step_completed`, divided by step viewers |
| Edge conversion | Sessions with a source completion to that destination and a target view at or after it in the same route revision, divided by sessions with that resolved source completion |
| Snapshot drop-off | The relevant denominator minus completed or converted sessions at the captured snapshot |

Repeated views, Back, and replay add each session once per displayed cohort, step, or edge. Skipped destinations contribute no eligible sessions. Historical revisions retain their observations when answers change. Edge chronology uses client action timestamps within a revision, so target-view and completion receipt order can be reversed without changing the final metric. Server receipt timestamps remain immutable audit data.

A zero denominator returns `null` and displays **Unavailable** with the underlying counts. Snapshot drop-off means incomplete observed progress, not permanent abandonment. Result screens have no completed transition; use result reach and CTA CTR for terminal engagement. Aggregates expose no answer values or session identifiers.

## Real synthetic traffic

From the repository root, run the endpoint-driven generator against a running website:

```sh
pnpm traffic "$WEBSITE_URL" --seed 20261004
```

The `traffic` script uses pinned `tsx` 4.23.15. Set `WEBSITE_URL` to Alchemy's reported website URL. The command creates 120 fictional sessions across both variants, two configurations, and two unique initial campaigns. It publishes one unique camp version and rolls back to the original active version. It exercises branches, varied stopping points, repeat views, duplicate IDs, conflicting ID reuse, replayed batches, and reordered delivery through real APIs. It preserves existing data and reports its run ID, campaign names, version IDs, actual times, manual references, and query results.

| Run cohort                    | Started | Results reached | CTA clickers |
| ----------------------------- | ------: | --------------: | -----------: |
| Explore campaign              |      80 |              32 |           24 |
| Direct campaign               |      40 |              24 |           16 |
| Combined generated population |     120 |              56 |           40 |

These are the independently specified expected counts, not a claim about all records already in a deployment. Filter the dashboard using the command's returned campaign and version IDs. Unrelated existing sessions remain present. The command verifies summaries, each step and edge, variant/version/campaign filters, empty rates, and replay against its manual references before reporting a match.

## Data model and source layout

| D1 table | Stored behavior |
| --- | --- |
| `funnel_versions` | Immutable version ID, configuration JSON, creation time |
| `funnel_active` | One active version for new sessions |
| `funnel_activations` | Ordered initial, publish, and rollback targets with previous version and activation time |
| `funnel_sessions` | Stable version and variant, accepted session state, creation/update times |
| `funnel_events` | Unique append-only event IDs, envelope metadata, properties, original receipt times |

Configuration and APIs call a screen a **step**, represented by `configuration.steps`, `stepId`, and `FunnelStep`.

The domain modules under `packages/core/src/funnel/` keep complete rules together: `configuration.ts` defines and validates configuration, `route.ts` resolves and prunes routes, `session.ts` accepts navigation, `versions.ts` handles activation, `events.ts` validates intake, and `analytics.ts` aggregates distinct session sets. `packages/database/src/funnel*.ts` implements their D1 persistence. `packages/database/src/schema.ts` defines tables; generated migrations and metadata live under `packages/database/migrations/`.

`apps/web/src/client/events.ts` owns durable delivery and configured emission. Features under `apps/web/src/features/` compose the funnel, versions page, and analytics page from the existing shadcn components. `apps/backend` projects shared capability contracts into HTTP, RPC, and MCP. `apps/infra` owns the Alchemy website, Worker, database, and test-stack wiring. Browser modules import contracts rather than server handlers.

Generate database changes with `pnpm --filter @core/database generate` and commit SQL plus Drizzle metadata. Preserve published SQL and immutable configuration records. Alchemy applies the same migrations locally and on deployment. [GLOSSARY.md](GLOSSARY.md) records domain vocabulary; [AGENTS.md](AGENTS.md) records repository rules.

## Interfaces

The website forwards capabilities to its backend service binding.

| Interface | Purpose |
| --- | --- |
| `POST /api/sessions` | Create a pinned session with optional variant and attribution |
| `GET /api/sessions/:id` | Resume its original definition and accepted state |
| `POST /api/sessions/:id/advance` | Validate `{ "stepId": ..., "answer": ... }` and advance |
| `POST /api/sessions/:id/back` | Return to visited eligible history |
| `GET /api/versions`, `POST /api/versions`, `POST /api/versions/rollback` | Inspect, publish, and roll back |
| `POST /api/events`, `GET /api/sessions/:id/events` | Ingest and inspect immutable events |
| `GET /api/analytics` | Filtered version, variant, and campaign aggregates |
| `GET /api/health` | Database readiness |
| `/rpc`, `/mcp` | Shared schema-derived RPC and MCP projections |
| `GET /openapi.json`, `GET /docs` | Generated API specification and reference |

MCP supports protocol versions 2025-06-18, 2025-03-26, and 2024-11-05. Its initialization and subsequent session requests share one Durable Object because the protocol session map is in memory. If that object restarts, a client must initialize again after an expired session returns 404. HTTP and RPC requests go directly to the backend Worker.

## Checks, test evidence, and review

```sh
pnpm check
pnpm test
```

Lefthook runs checks and unit tests on every commit; never bypass hooks. Full handover and completed task PRs require both commands above. The full suite uses real Cloudflare test stages and D1 databases plus browser journeys, retains reports and screenshots, and cleans only its owned ephemeral stacks. The persistent public demonstration stage is separate and retains its historical data.

`pnpm test` starts API and browser suites together after units. The remote wrapper waits for both suites, including cleanup, and fails if either fails. API files use two workers with independent stages; browser journeys stay serial. Ignored per-build output under `apps/web/dist/test-<build-process-id>` prevents one Vite build from clearing assets another stack is uploading. One recorded local comparison reduced the full suite from 409.42 to 167.31 seconds, about 59% shorter. That is measured evidence rather than a timing guarantee. Read-only document, health, MCP, and actual OpenAPI readiness checks distinguish Cloudflare's cold placeholder from the application before mutations. Mutations are not retried blindly.

For a directly selected public compatibility journey from `apps/web`, use the runner's collection selector rather than the ephemeral-stack wrapper:

```sh
APP_URL="$WEBSITE_URL" E2E_TEST_FILE=test/e2e/iteration-two.e2e.ts pnpm exec e2e run --output .e2e/public-iteration-two --trace on --video on
```

Run this command from `apps/web`. The runner requires an output directory inside that project; copy the completed report and artifacts outside the checkout afterward.

This journey publishes a unique copy of the fictional fixture and rolls back once, preserving the old B session and new A/B sessions. It does not seed or delete the persistent traffic population. It must run after first-iteration acceptance.

The [native GitHub stack](https://github.com/patrikduksin/fullstack-take-home-assignment/pull/12) is #19, ordered #12 → #13 → #16 → #15 → #18 → #17 → #21 → #20 → #30 → #31 → #29 → [#32](https://github.com/patrikduksin/fullstack-take-home-assignment/pull/32). Task PRs carry local API/browser evidence, artifact downloads, and UI screenshots. [Integration PR #14](https://github.com/patrikduksin/fullstack-take-home-assignment/pull/14) provides the combined change against `main`; it is separate from the per-task stack. The task stack is merged into `main`; its PRs retain the implementation history and test evidence.

The repository's Cloudflare Actions secrets are missing: `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Local verification uses the working Cloudflare profile. The user accepted local evidence with this CI limitation; CI still runs the required tests. Local OAuth credentials are not transferred to GitHub. See the [observed CI failure](https://github.com/patrikduksin/fullstack-take-home-assignment/actions/runs/37179622508).

## Deployment and actual chronology

Cloudflare Workers and D1 are the accepted runtime and storage for this exercise. Alchemy declares the infrastructure. On a fresh machine, create the `tha2` Cloudflare profile, select the personal account that owns the domain, then inspect the plan before deployment:

```sh
pnpm exec alchemy profile create tha2
pnpm exec alchemy profile edit --config apps/infra/alchemy.run.ts --profile tha2 --add Cloudflare
pnpm infra:plan --profile tha2 --stage tha2-demo --detailed --no-input
pnpm infra:deploy --profile tha2 --stage tha2-demo --yes --no-input
```

Run remote tests with `ALCHEMY_PROFILE=tha2 pnpm test` when using this profile.

The `tha2` profile selects the personal Cloudflare account that owns `tha2.app`. The `tha2-demo` stage attaches that custom domain; local development and temporary test stages do not. Cloudflare manages its DNS record and TLS certificate. The persistent stage creates the public website, private backend Worker, D1, and required bindings. The backend has no public workers.dev origin; public API checks use the website. Keep the reported website URL and persistent records after smoke checks. Deployment is separate from local development.

The following milestones describe the original `assignment-demo` acceptance.

| Milestone                                   | Actual UTC time             |
| ------------------------------------------- | --------------------------- |
| Original agreed assignment start            | Not supplied                |
| Complete local first-iteration acceptance   | 2026-10-04 08:20:53 UTC     |
| First local second-iteration publication    | 2026-10-04 08:23:49 UTC     |
| Persistent website deployment               | 2026-10-04 08:37:59.854 UTC |
| Persistent first-iteration acceptance       | 2026-10-04 08:45:24.788 UTC |
| Persistent second-iteration publication     | 2026-10-04 08:48:39.418 UTC |
| Persistent compatibility rollback           | 2026-10-04 08:49:05.585 UTC |
| Persistent rollback and retained-data proof | 2026-10-04 08:49:47.440 UTC |

The complete local second-iteration checks passed at 2026-10-04 08:35:41 UTC. These times come from retained reports and activation history. Incremental commits and earlier command-line traffic milestones are not full first-iteration acceptance. The original 48-hour start was not provided, so it is not inferred from implementation activity.

The original `assignment-demo` demonstration retained the generated 120-session population with 56 result-reaching sessions and 40 CTA clickers. Thirteen final public browser checks passed across health, funnel, event delivery, dashboard and second-iteration compatibility, with zero failed, flaky or skipped checks. Historical traffic counts remained unchanged after publication and rollback. The original B browser profile still resumed its original preparation screen, and both new A/B sessions retained the second version and its configured non-sensitive event.

During public acceptance, a rollback POST outside the coordinated test run reactivated the camp version at 08:45:25 UTC. Native Worker logs confirmed the request; its caller is unknown. The compatibility precondition stopped before publication. One guarded, recorded restore returned to trail, then the complete compatibility journey passed. This demonstrates the documented unauthenticated operator scope: other visitors can change the active version. The failed precondition, request history, restoration and successful follow-up are retained as evidence.

The current demo at `https://tha2.app` is a fresh deployment in the domain owner’s personal account. It was deployed at 2026-10-04 09:32:50 UTC. Traffic run `1791106411327-20261004` generated and replayed 120 sessions, verified independent reference counts and filters, and restored `trail-branches-v1`. Its fresh data replaces the old demo database as requested. The old account’s `assignment-demo` website, backend Worker, and database were destroyed at 2026-10-04 09:37:58 UTC after the new domain passed all six final public browser checks. The chronology above describes the original assignment acceptance; its attached evidence remains available. New domain verification, traffic output, browser reports, screenshots, and traces are in the [domain evidence archive](https://github.com/patrikduksin/fullstack-take-home-assignment/releases/download/funnel-runtime-evidence-2026-10-04/tha2-domain-evidence.zip). View the [populated dashboard screenshot](https://github.com/patrikduksin/fullstack-take-home-assignment/releases/download/funnel-runtime-evidence-2026-10-04/tha2-domain-dashboard.png) or [funnel screenshot](https://github.com/patrikduksin/fullstack-take-home-assignment/releases/download/funnel-runtime-evidence-2026-10-04/tha2-domain-welcome.png).

## Repository provenance

Project skills live in [`skills/`](skills); run `pnpm skills:install` after editing their sources. Installed `.agents/skills` copies are generated. The project is adapted from [joelhooks/rat-stack](https://github.com/joelhooks/rat-stack/tree/c7d11aa396dad097ecb41a3f316cc905f6037063), retaining its MIT license, capability projections, and lint conventions.
