import { implement } from "@core/capability/implement";
import { Context, Effect } from "effect";

import { answerError } from "./configuration.js";
import {
  advanceSessionContract,
  backSessionContract,
  createSessionContract,
  FunnelError,
  loadSessionContract,
} from "./contracts.js";
import type { FunnelSession, SessionView } from "./contracts.js";

export class FunnelSessions extends Context.Service<
  FunnelSessions,
  {
    readonly create: Effect.Effect<SessionView, FunnelError>;
    readonly load: (id: string) => Effect.Effect<SessionView, FunnelError>;
    readonly save: (session: FunnelSession) => Effect.Effect<void, FunnelError>;
  }
>()("@core/core/funnel/FunnelSessions") {}

const createSession = implement(createSessionContract, () =>
  FunnelSessions.use((sessions) => sessions.create)
);

const loadSession = implement(loadSessionContract, ({ id }) =>
  FunnelSessions.use((sessions) => sessions.load(id))
);

const advanceSession = implement(
  advanceSessionContract,
  Effect.fn("advanceSession")(function* advanceSession({ id, answer }) {
    const sessions = yield* FunnelSessions;
    const view = yield* sessions.load(id);

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

    if (step.next === undefined) {
      return yield* new FunnelError({ message: "There is no next step." });
    }

    const session: FunnelSession = {
      ...view.session,
      answers:
        step.type === "information"
          ? view.session.answers
          : { ...view.session.answers, [step.id]: answer },
      currentStep: step.next,
      history: [...view.session.history, step.id],
    };

    yield* sessions.save(session);

    return { ...view, session };
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

    yield* sessions.save(session);

    return { ...view, session };
  })
);

export const funnelSessionCapabilities = [
  createSession,
  loadSession,
  advanceSession,
  backSession,
] as const;
