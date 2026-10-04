import { implement } from "@core/capability/implement";
import { Context, Effect, Schema } from "effect";

import { answerError, VariantSchema } from "./configuration.js";
import {
  advanceSessionContract,
  backSessionContract,
  createSessionContract,
  FunnelError,
  loadSessionContract,
} from "./contracts.js";
import type {
  CreateSessionInput,
  FunnelSession,
  SessionView,
} from "./contracts.js";
import { pruneAnswers } from "./route.js";

export class FunnelSessions extends Context.Service<
  FunnelSessions,
  {
    readonly create: (
      input: CreateSessionInput
    ) => Effect.Effect<SessionView, FunnelError>;
    readonly load: (id: string) => Effect.Effect<SessionView, FunnelError>;
    readonly save: (
      session: FunnelSession,
      expectedCurrentStep: string
    ) => Effect.Effect<void, FunnelError>;
  }
>()("@core/core/funnel/FunnelSessions") {}

const createSession = implement(
  createSessionContract,
  Effect.fn("createSession")(function* createSession(input) {
    if (
      input.variant !== undefined &&
      !Schema.is(VariantSchema)(input.variant)
    ) {
      return yield* new FunnelError({
        message: "Choose variant A or B for a new session.",
      });
    }

    const sessions = yield* FunnelSessions;

    return yield* sessions.create(input);
  })
);

const loadSession = implement(loadSessionContract, ({ id }) =>
  FunnelSessions.use((sessions) => sessions.load(id))
);

const advanceSession = implement(
  advanceSessionContract,
  Effect.fn("advanceSession")(function* advanceSession({ id, answer, stepId }) {
    const sessions = yield* FunnelSessions;
    const view = yield* sessions.load(id);

    if (stepId !== view.session.currentStep || !view.route.includes(stepId)) {
      return yield* new FunnelError({
        message:
          "That step is no longer available. Reload your session before continuing.",
      });
    }

    const step = view.configuration.steps.find(
      (candidate) => candidate.id === view.session.currentStep
    );

    if (step === undefined) {
      return yield* new FunnelError({
        message: "The current step is unavailable.",
      });
    }

    const message = answerError(step, answer);

    if (message !== undefined) {
      return yield* new FunnelError({ message });
    }

    const submitted =
      step.type === "information"
        ? view.session.answers
        : { ...view.session.answers, [step.id]: answer };

    const { answers, route } = pruneAnswers(view.configuration, submitted);
    const destination = route[route.indexOf(step.id) + 1];

    if (destination === undefined) {
      return yield* new FunnelError({
        message: "There is no eligible next step.",
      });
    }

    const eligible = new Set(route);

    const routeChanged =
      route.length !== view.route.length ||
      route.some((eligibleId, index) => eligibleId !== view.route[index]);

    const session: FunnelSession = {
      ...view.session,
      answers,
      currentStep: destination,
      history: [
        ...view.session.history.filter((eligibleId) =>
          eligible.has(eligibleId)
        ),
        step.id,
      ],
      routeRevision: view.session.routeRevision + (routeChanged ? 1 : 0),
    };

    yield* sessions.save(session, stepId);

    return { ...view, route, session };
  })
);

const backSession = implement(
  backSessionContract,
  Effect.fn("backSession")(function* backSession({ id }) {
    const sessions = yield* FunnelSessions;
    const view = yield* sessions.load(id);
    const previous = view.session.history.at(-1);

    if (previous === undefined) {
      return yield* new FunnelError({
        message: "You are already at the first step.",
      });
    }

    const session = {
      ...view.session,
      currentStep: previous,
      history: view.session.history.slice(0, -1),
    };

    yield* sessions.save(session, view.session.currentStep);

    return { ...view, session };
  })
);

export const funnelSessionCapabilities = [
  createSession,
  loadSession,
  advanceSession,
  backSession,
] as const;
