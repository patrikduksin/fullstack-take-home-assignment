import { Schema } from "effect";

export const AnswerSchema = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String),
  Schema.Finite,
  Schema.Null,
]);

export type Answer = typeof AnswerSchema.Type;

const Option = Schema.Struct({ id: Schema.String, label: Schema.String });

export const ConditionSchema = Schema.Union([
  Schema.Struct({
    operator: Schema.Literals(["equals", "includes"]),
    stepId: Schema.String,
    value: Schema.String,
  }),
  Schema.Struct({
    operator: Schema.Literals(["gte", "lte"]),
    stepId: Schema.String,
    value: Schema.Finite,
  }),
]);

export type Condition = typeof ConditionSchema.Type;

export const TransitionSchema = Schema.Struct({
  branches: Schema.Array(
    Schema.Struct({ next: Schema.String, when: ConditionSchema })
  ),
  default: Schema.String,
});

export const FunnelStepSchema = Schema.Struct({
  body: Schema.optional(Schema.String),
  cta: Schema.optional(
    Schema.Struct({ href: Schema.String, label: Schema.String })
  ),
  id: Schema.String,
  max: Schema.optional(Schema.Finite),
  min: Schema.optional(Schema.Finite),
  next: Schema.optional(Schema.String),
  options: Schema.optional(Schema.Array(Option)),
  title: Schema.String,
  transition: Schema.optional(TransitionSchema),
  type: Schema.Literals([
    "single-select",
    "multi-select",
    "number",
    "information",
    "result",
  ]),
});

export type FunnelStep = typeof FunnelStepSchema.Type;

export const FunnelConfigurationSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  start: Schema.String,
  steps: Schema.Array(FunnelStepSchema),
});

export type FunnelConfiguration = typeof FunnelConfigurationSchema.Type;

const numberError = (step: FunnelStep, answer: Answer): string | undefined =>
  Schema.is(Schema.Finite)(answer) &&
  answer >= (step.min ?? Number.NEGATIVE_INFINITY) &&
  answer <= (step.max ?? Number.POSITIVE_INFINITY)
    ? undefined
    : `Enter a number between ${step.min ?? "the minimum"} and ${step.max ?? "the maximum"}.`;

export const answerError = (
  step: FunnelStep,
  answer: Answer
): string | undefined => {
  const options = new Set(step.options?.map((option) => option.id));

  const minimum = step.min ?? 1;
  const maximum = step.max ?? options.size;

  switch (step.type) {
    case "single-select": {
      return Schema.is(Schema.String)(answer) && options.has(answer)
        ? undefined
        : "Choose one option.";
    }

    case "multi-select": {
      if (
        !Schema.is(Schema.Array(Schema.String))(answer) ||
        answer.some((value) => !options.has(value)) ||
        new Set(answer).size !== answer.length
      ) {
        return "Choose only the listed options, without duplicates.";
      }

      return answer.length >= minimum && answer.length <= maximum
        ? undefined
        : `Choose between ${minimum} and ${maximum} options.`;
    }

    case "number": {
      return numberError(step, answer);
    }

    case "information": {
      return answer === null
        ? undefined
        : "This step does not accept an answer.";
    }

    case "result": {
      return "The result is the final step.";
    }

    default: {
      return "Unsupported screen type.";
    }
  }
};
