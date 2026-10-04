import { implement } from "@core/capability/implement";
import {
  Context,
  DateTime,
  Effect,
  Match,
  Option,
  Result,
  Schema,
} from "effect";

import type {
  BuiltinEventType,
  EventDeclaration,
  FunnelStep,
} from "./configuration.js";
import { BuiltinEventTypeSchema } from "./configuration.js";
import {
  FunnelEventSchema,
  ingestEventsContract,
  loadSessionEventsContract,
} from "./contracts.js";
import type {
  EventReceipt,
  FunnelError,
  FunnelEvent,
  SessionView,
  StoredFunnelEvent,
} from "./contracts.js";
import { FunnelSessions } from "./session.js";

export class FunnelEvents extends Context.Service<
  FunnelEvents,
  {
    readonly append: (
      event: FunnelEvent
    ) => Effect.Effect<Omit<EventReceipt, "index">, FunnelError>;
    readonly forSession: (
      id: string
    ) => Effect.Effect<readonly StoredFunnelEvent[], FunnelError>;
  }
>()("@core/core/funnel/FunnelEvents") {}

const strict = { onExcessProperty: "error" } as const;

const RouteRevision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const RouteProperties = Schema.Struct({ routeRevision: RouteRevision });

const StepId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128)
);

const builtinProperties = {
  answer_submitted: RouteProperties,
  back_clicked: Schema.Struct({
    routeRevision: RouteRevision,
    targetStepId: StepId,
  }),
  cta_clicked: RouteProperties,
  result_viewed: RouteProperties,
  step_completed: Schema.Struct({
    nextStepId: StepId,
    routeRevision: RouteRevision,
  }),
  step_viewed: RouteProperties,
};

const IsoTimestamp = Schema.String.check(
  Schema.isPattern(
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
  )
);

export const canonicalEvent = (event: FunnelEvent): string =>
  JSON.stringify([
    event.eventId,
    event.type,
    event.sessionId,
    event.clientTimestamp,
    event.version,
    event.variant,
    event.stepId,
    Object.entries(event.utm).toSorted(([left], [right]) =>
      left.localeCompare(right)
    ),
    Object.entries(event.properties).toSorted(([left], [right]) =>
      left.localeCompare(right)
    ),
  ]);

const builtinEventError = (
  view: SessionView,
  step: FunnelStep,
  event: FunnelEvent,
  type: Exclude<BuiltinEventType, "session_started">
): string | undefined => {
  const properties = Schema.decodeUnknownOption(
    builtinProperties[type],
    strict
  )(event.properties);

  if (Option.isNone(properties)) {
    return "Event properties must use the declared non-sensitive fields.";
  }

  if (properties.value.routeRevision > view.session.routeRevision) {
    return "The event route revision has not occurred in this session.";
  }

  if (
    event.type === "step_completed" &&
    (step.type === "result" ||
      ![
        step.next,
        step.transition?.default,
        ...(step.transition?.branches.map((branch) => branch.next) ?? []),
      ].includes(String(event.properties.nextStepId)))
  ) {
    return "The completed transition is not configured for this step.";
  }

  if (
    event.type === "back_clicked" &&
    (!view.configuration.steps.some(
      (candidate) => candidate.id === event.properties.targetStepId
    ) ||
      event.properties.targetStepId === step.id)
  ) {
    return "The Back target is not another configured step.";
  }

  if (
    (event.type === "result_viewed" || event.type === "cta_clicked") &&
    step.type !== "result"
  ) {
    return "Result and CTA events require a result step.";
  }

  if (event.type === "cta_clicked" && step.cta === undefined) {
    return "This result does not have a configured CTA.";
  }

  if (
    event.type === "answer_submitted" &&
    (step.type === "information" || step.type === "result")
  ) {
    return "Only input steps accept answer-submitted events.";
  }

  return undefined;
};

const declaredEventError = (
  view: SessionView,
  event: FunnelEvent,
  declaration: EventDeclaration
): string | undefined => {
  if (
    !declaration.stepIds.some((id) => id === event.stepId) ||
    !view.configuration.steps.some((step) => step.id === event.stepId)
  ) {
    return "The event step is outside this declaration's configured steps.";
  }

  if (
    Object.keys(event.properties).some(
      (key) => !Object.hasOwn(declaration.properties, key)
    )
  ) {
    return "Custom event properties must use only their declared fields.";
  }

  for (const [name, property] of Object.entries(declaration.properties)) {
    const value = event.properties[name];

    const valid = Match.value(property).pipe(
      Match.when({ kind: "boolean" }, () => Schema.is(Schema.Boolean)(value)),
      Match.when({ kind: "enum" }, (descriptor) =>
        Schema.is(Schema.Literals(descriptor.values))(value)
      ),
      Match.when(
        { kind: "step" },
        () =>
          Schema.is(StepId)(value) &&
          view.configuration.steps.some((step) => step.id === value)
      ),
      Match.exhaustive
    );

    if (!valid) {
      return `Custom event property ${name} does not match its non-sensitive declaration.`;
    }
  }

  return undefined;
};

const eventError = (
  view: SessionView,
  event: FunnelEvent
): string | undefined => {
  if (
    event.version !== view.session.version ||
    event.variant !== view.session.variant
  ) {
    return "Event version and variant must match the pinned session.";
  }

  const attributed = { ...event, utm: view.session.utm };

  if (canonicalEvent(event) !== canonicalEvent(attributed)) {
    return "Event attribution must match the session's initial UTM fields.";
  }

  if (event.eventId.startsWith("session_started:")) {
    return "Session starts are recorded by the server.";
  }

  if (!Schema.is(BuiltinEventTypeSchema)(event.type)) {
    const declaration = view.configuration.eventTypes?.find(
      (candidate) => candidate.type === event.type
    );

    return declaration === undefined
      ? "This event type is not declared by the pinned configuration."
      : declaredEventError(view, event, declaration);
  }

  if (event.type === "session_started") {
    return "Session starts are recorded by the server.";
  }

  const step = view.configuration.steps.find(
    (candidate) => candidate.id === event.stepId
  );

  if (step === undefined) {
    return "The event step is not in this session's configured variant.";
  }

  return builtinEventError(view, step, event, event.type);
};

const ingestEvents = implement(
  ingestEventsContract,
  Effect.fn("ingestEvents")(function* ingestEvents({ events: batch }) {
    const sessions = yield* FunnelSessions;
    const events = yield* FunnelEvents;
    const results: EventReceipt[] = [];

    for (const [index, input] of batch.entries()) {
      const decoded = yield* Effect.result(
        Schema.decodeUnknownEffect(FunnelEventSchema, strict)(input)
      );

      if (Result.isFailure(decoded)) {
        results.push({
          error: "Invalid event envelope.",
          index,
          status: "rejected",
        });
        continue;
      }

      const event = decoded.success;

      const timestamp = yield* Effect.result(
        Schema.decodeEffect(IsoTimestamp)(event.clientTimestamp).pipe(
          Effect.flatMap(Schema.decodeEffect(Schema.DateTimeUtcFromString))
        )
      );

      if (Result.isFailure(timestamp)) {
        results.push({
          error: "Use an ISO timestamp for the client event time.",
          eventId: event.eventId,
          index,
          status: "rejected",
        });
        continue;
      }

      const calendar = yield* Effect.result(
        Schema.decodeEffect(Schema.DateTimeUtcFromString)(
          `${event.clientTimestamp.slice(0, 10)}T00:00:00.000Z`
        )
      );

      if (
        Result.isFailure(calendar) ||
        DateTime.formatIso(calendar.success).slice(0, 10) !==
          event.clientTimestamp.slice(0, 10)
      ) {
        results.push({
          error: "The client timestamp must be a real calendar date.",
          eventId: event.eventId,
          index,
          status: "rejected",
        });
        continue;
      }

      const loaded = yield* Effect.result(sessions.load(event.sessionId));

      if (Result.isFailure(loaded)) {
        if (loaded.failure.reason !== "session_not_found") {
          return yield* loaded.failure;
        }

        results.push({
          error: loaded.failure.message,
          eventId: event.eventId,
          index,
          status: "rejected",
        });
        continue;
      }

      const normalized = {
        ...event,
        clientTimestamp: DateTime.formatIso(timestamp.success),
        utm: loaded.success.session.utm,
      };

      const message = eventError(loaded.success, event);

      if (message !== undefined) {
        results.push({
          error: message,
          eventId: event.eventId,
          index,
          status: "rejected",
        });
        continue;
      }

      const receipt = yield* events.append(normalized);
      results.push({ ...receipt, index });
    }

    return { results };
  })
);

const loadSessionEvents = implement(
  loadSessionEventsContract,
  Effect.fn("loadSessionEvents")(function* loadSessionEvents({ id }) {
    const sessions = yield* FunnelSessions;
    yield* sessions.load(id);
    const events = yield* FunnelEvents;

    return yield* events.forSession(id);
  })
);

export const funnelEventCapabilities = [
  loadSessionEvents,
  ingestEvents,
] as const;
