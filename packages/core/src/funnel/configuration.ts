import { Schema } from "effect";

export const AnswerSchema = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String),
  Schema.Finite,
  Schema.Null,
]);

export type Answer = typeof AnswerSchema.Type;

const Option = Schema.Struct({ id: Schema.String, label: Schema.String });

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
  type: Schema.Literals([
    "single-select",
    "multi-select",
    "number",
    "information",
    "result",
  ]),
});

export type FunnelStep = typeof FunnelStepSchema.Type;

export const VariantSchema = Schema.Literals(["A", "B"]);

export type Variant = typeof VariantSchema.Type;

const StepOverrideSchema = Schema.Struct({
  body: FunnelStepSchema.fields.body,
  cta: FunnelStepSchema.fields.cta,
  max: FunnelStepSchema.fields.max,
  min: FunnelStepSchema.fields.min,
  next: FunnelStepSchema.fields.next,
  options: FunnelStepSchema.fields.options,
  title: Schema.optional(Schema.String),
});

const VariantOverrideSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
  steps: Schema.optional(Schema.Record(Schema.String, StepOverrideSchema)),
});

export const FunnelConfigurationSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  start: Schema.String,
  steps: Schema.Array(FunnelStepSchema),
  variants: Schema.optional(
    Schema.Struct({
      A: Schema.optional(VariantOverrideSchema),
      B: Schema.optional(VariantOverrideSchema),
    })
  ),
});

export type FunnelConfiguration = typeof FunnelConfigurationSchema.Type;

export const resolveVariant = (
  configuration: FunnelConfiguration,
  variant: Variant
): FunnelConfiguration => {
  const { variants, ...base } = configuration;
  const override = variants?.[variant];

  return {
    ...base,
    name: override?.name ?? base.name,
    start: override?.start ?? base.start,
    steps: base.steps.map((step) => ({
      ...step,
      ...override?.steps?.[step.id],
      title: override?.steps?.[step.id]?.title ?? step.title,
    })),
  };
};

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
