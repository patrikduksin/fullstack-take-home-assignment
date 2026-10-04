import { EventReceiptSchema, FunnelEventSchema } from "@core/core/contracts";
import type { FunnelEvent, SessionView } from "@core/core/contracts";
import {
  Data,
  DateTime,
  Effect,
  Fiber,
  Option,
  Schedule,
  Schema,
} from "effect";
import { FetchHttpClient, HttpBody, HttpClient } from "effect/http";

const pendingPrefix = "funnel-event:pending:";

const rejectedKey = "funnel-event:rejected";

const RejectedEventSchema = Schema.Struct({
  eventId: Schema.String,
  reason: Schema.String,
  rejectedAt: Schema.String,
  type: Schema.String,
});

const decodeRejected = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(RejectedEventSchema))
);

const decodePending = Schema.decodeUnknownOption(
  Schema.fromJsonString(FunnelEventSchema),
  { onExcessProperty: "error" }
);

class DeliveryUnavailable extends Data.TaggedError("DeliveryUnavailable")<{
  message: string;
}> {}

const rejectPending = (
  key: string,
  eventId: string,
  reason: string,
  type = "invalid"
) => {
  const rejected = Option.getOrElse(
    decodeRejected(localStorage.getItem(rejectedKey)),
    () => []
  );

  localStorage.setItem(
    rejectedKey,
    JSON.stringify(
      [
        ...rejected,
        {
          eventId,
          reason,
          rejectedAt: DateTime.formatIso(DateTime.nowUnsafe()),
          type,
        },
      ].slice(-20)
    )
  );
  localStorage.removeItem(key);
};

const pendingBatch = () =>
  Object.keys(localStorage)
    .filter((key) => key.startsWith(pendingPrefix))
    .flatMap((key) => {
      const saved = localStorage.getItem(key);

      if (saved === null) {
        return [];
      }

      const decoded = decodePending(saved);

      if (
        Option.isNone(decoded) ||
        key !== `${pendingPrefix}${decoded.value.eventId}`
      ) {
        rejectPending(
          key,
          key.slice(pendingPrefix.length),
          "The saved event record is invalid."
        );

        return [];
      }

      return [{ event: decoded.value, key }];
    })
    .toSorted((left, right) =>
      left.event.clientTimestamp.localeCompare(right.event.clientTimestamp)
    )
    .slice(0, 20);

const flushPendingEvents = Effect.fn("flushPendingEvents")(
  function* flushPendingEvents() {
    const batch = yield* Effect.sync(pendingBatch);

    if (batch.length === 0) {
      return yield* Effect.void;
    }

    const response = yield* HttpClient.post("/api/events", {
      body: HttpBody.jsonUnsafe({ events: batch.map((entry) => entry.event) }),
    });

    if (response.status !== 200) {
      return yield* new DeliveryUnavailable({
        message: "Event delivery is temporarily unavailable.",
      });
    }

    const receipts = yield* response.json.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Struct({ results: Schema.Array(EventReceiptSchema) })
        )
      )
    );

    return yield* Effect.sync(() => {
      for (const receipt of receipts.results) {
        const entry = batch[receipt.index];

        if (
          entry === undefined ||
          (receipt.eventId !== undefined &&
            receipt.eventId !== entry.event.eventId)
        ) {
          continue;
        }

        if (receipt.status === "rejected") {
          rejectPending(
            entry.key,
            entry.event.eventId,
            receipt.error ?? "The server rejected this event.",
            entry.event.type
          );
        } else {
          localStorage.removeItem(entry.key);
        }
      }
    });
  },
  Effect.timeout("30 seconds"),
  Effect.ignore,
  Effect.provide(FetchHttpClient.layer)
);

const enqueue = (
  view: SessionView,
  type: string,
  stepId: string,
  properties: FunnelEvent["properties"]
): FunnelEvent => {
  const event: FunnelEvent = {
    clientTimestamp: DateTime.formatIso(DateTime.nowUnsafe()),
    // @effect-diagnostics-next-line cryptoRandomUUID:off -- Persist the native browser ID synchronously before navigation can unload the page.
    eventId: crypto.randomUUID(),
    properties,
    sessionId: view.session.id,
    stepId,
    type,
    utm: view.session.utm,
    variant: view.session.variant,
    version: view.session.version,
  };

  localStorage.setItem(
    `${pendingPrefix}${event.eventId}`,
    JSON.stringify(event)
  );

  return event;
};

export const recordDisplayedStep = (view: SessionView) => {
  const step = view.configuration.steps.find(
    (candidate) => candidate.id === view.session.currentStep
  );

  if (step === undefined) {
    return;
  }

  const properties = { routeRevision: view.session.routeRevision };
  enqueue(view, "step_viewed", step.id, properties);

  if (step.type === "result") {
    enqueue(view, "result_viewed", step.id, properties);
  }
};

export const recordAdvance = (previous: SessionView, next: SessionView) => {
  const step = previous.configuration.steps.find(
    (candidate) => candidate.id === previous.session.currentStep
  );

  if (step === undefined || step.type === "result") {
    return;
  }

  const properties = { routeRevision: next.session.routeRevision };

  if (step.type !== "information") {
    enqueue(previous, "answer_submitted", step.id, properties);
  }

  enqueue(previous, "step_completed", step.id, {
    ...properties,
    nextStepId: next.session.currentStep,
  });
};

export const recordBack = (previous: SessionView, next: SessionView) => {
  enqueue(previous, "back_clicked", previous.session.currentStep, {
    routeRevision: next.session.routeRevision,
    targetStepId: next.session.currentStep,
  });
};

export const recordCta = (view: SessionView) => {
  enqueue(view, "cta_clicked", view.session.currentStep, {
    routeRevision: view.session.routeRevision,
  });
};

export const startEventDelivery = () => {
  const fiber = Effect.runFork(
    flushPendingEvents().pipe(Effect.repeat(Schedule.spaced("1 second")))
  );

  return () => {
    void Effect.runPromise(Fiber.interrupt(fiber));
  };
};
