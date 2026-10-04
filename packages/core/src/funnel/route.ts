import { Schema } from "effect";

import type {
  Answer,
  Condition,
  FunnelConfiguration,
  FunnelStep,
} from "./configuration.js";

type Answers = Readonly<Record<string, Answer>>;

const matchesCondition = (condition: Condition, answers: Answers): boolean => {
  const answer = answers[condition.stepId];

  switch (condition.operator) {
    case "equals": {
      return answer === condition.value;
    }

    case "includes": {
      return (
        Schema.is(Schema.Array(Schema.String))(answer) &&
        answer.includes(condition.value)
      );
    }

    case "gte": {
      return Schema.is(Schema.Finite)(answer) && answer >= condition.value;
    }

    case "lte": {
      return Schema.is(Schema.Finite)(answer) && answer <= condition.value;
    }

    default: {
      return false;
    }
  }
};

export const nextStep = (
  step: FunnelStep,
  answers: Answers
): string | undefined => {
  if (step.transition === undefined) {
    return step.next;
  }

  return (
    step.transition.branches.find((branch) =>
      matchesCondition(branch.when, answers)
    )?.next ?? step.transition.default
  );
};

export const resolveRoute = (
  configuration: FunnelConfiguration,
  answers: Answers
): readonly string[] => {
  const steps = new Map(configuration.steps.map((step) => [step.id, step]));
  const route: string[] = [];
  const reachedAnswers: Record<string, Answer> = {};
  let id: string | undefined = configuration.start;

  while (id !== undefined) {
    const step = steps.get(id);

    if (step === undefined || route.includes(id)) {
      throw new Error("The configuration does not define a valid route.");
    }

    route.push(id);

    if (step.type === "result") {
      break;
    }

    const answer = answers[id];

    if (answer !== undefined) {
      reachedAnswers[id] = answer;
    }

    id = nextStep(step, reachedAnswers);
  }

  return route;
};

export const pruneAnswers = (
  configuration: FunnelConfiguration,
  answers: Answers
) => {
  const route = resolveRoute(configuration, answers);
  const eligible = new Set(route);

  return {
    answers: Object.fromEntries(
      Object.entries(answers).filter(([id]) => eligible.has(id))
    ),
    route,
  };
};
