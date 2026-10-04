import { Effect, flow, Schema } from "effect";

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
  id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
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
  transition: FunnelStepSchema.fields.transition,
});

const VariantOverrideSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
  steps: Schema.optional(Schema.Record(Schema.String, StepOverrideSchema)),
});

const EventPropertyDeclarationSchema = Schema.Union([
  Schema.Struct({
    emit: Schema.optional(Schema.Boolean),
    kind: Schema.Literal("boolean"),
  }),
  Schema.Struct({
    emit: Schema.optional(Schema.String),
    kind: Schema.Literal("enum"),
    values: Schema.NonEmptyArray(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
    ),
  }),
  Schema.Struct({
    emit: Schema.optional(Schema.Literals(["source", "target"])),
    kind: Schema.Literal("step"),
  }),
]);

export const EventDeclarationSchema = Schema.Struct({
  on: Schema.optional(Schema.Literal("step_completed")),
  properties: Schema.Record(
    Schema.String.check(Schema.isPattern(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u)),
    EventPropertyDeclarationSchema
  ),
  stepIds: Schema.NonEmptyArray(Schema.String),
  type: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_]{0,63}$/u)),
});

export type EventDeclaration = typeof EventDeclarationSchema.Type;

export const FunnelConfigurationSchema = Schema.Struct({
  eventTypes: Schema.optional(Schema.Array(EventDeclarationSchema)),
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
    steps: base.steps.map((step) => {
      const replacement = override?.steps?.[step.id];

      const resolved = {
        ...step,
        ...replacement,
        title: replacement?.title ?? step.title,
      };

      if (replacement?.transition !== undefined) {
        delete resolved.next;
      }

      if (replacement?.next !== undefined) {
        delete resolved.transition;
      }

      return resolved;
    }),
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

export const BuiltinEventTypeSchema = Schema.Literals([
  "session_started",
  "step_viewed",
  "answer_submitted",
  "step_completed",
  "back_clicked",
  "result_viewed",
  "cta_clicked",
]);

export type BuiltinEventType = typeof BuiltinEventTypeSchema.Type;

export class ConfigurationInvalid extends Schema.TaggedError<ConfigurationInvalid>()(
  "ConfigurationInvalid",
  { message: Schema.String }
) {}

const eventPropertyError = (
  declaration: EventDeclaration,
  name: string,
  property: typeof EventPropertyDeclarationSchema.Type
): string | undefined => {
  if (/answer|email|phone|free.?text|url|contact/iu.test(name)) {
    return `Event ${declaration.type} cannot declare sensitive property ${name}.`;
  }

  if (declaration.on !== undefined && property.emit === undefined) {
    return `Automatic event ${declaration.type} needs an emission value for ${name}.`;
  }

  if (
    property.kind === "enum" &&
    (new Set(property.values).size !== property.values.length ||
      (property.emit !== undefined && !property.values.includes(property.emit)))
  ) {
    return `Event ${declaration.type} needs unique enum values and a listed emission value.`;
  }

  return undefined;
};

const eventDeclarationError = (
  configuration: FunnelConfiguration,
  declaration: EventDeclaration
): string | undefined => {
  if (Schema.is(BuiltinEventTypeSchema)(declaration.type)) {
    return `Event ${declaration.type} is reserved by the runtime.`;
  }

  if (new Set(declaration.stepIds).size !== declaration.stepIds.length) {
    return `Event ${declaration.type} has duplicate step references.`;
  }

  for (const id of declaration.stepIds) {
    const step = configuration.steps.find((candidate) => candidate.id === id);

    if (step === undefined) {
      return `Event ${declaration.type} references missing step ${id}.`;
    }

    if (declaration.on === "step_completed" && step.type === "result") {
      return `Event ${declaration.type} cannot complete a result step.`;
    }
  }

  for (const [name, property] of Object.entries(declaration.properties)) {
    const error = eventPropertyError(declaration, name, property);

    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
};

const eventDeclarationsError = (
  configuration: FunnelConfiguration
): string | undefined => {
  const declarations = configuration.eventTypes ?? [];

  if (
    new Set(declarations.map((declaration) => declaration.type)).size !==
    declarations.length
  ) {
    return "Declared event types must be unique.";
  }

  for (const declaration of declarations) {
    const error = eventDeclarationError(configuration, declaration);

    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
};

const choiceError = (step: FunnelStep): string | undefined => {
  if (step.options === undefined || step.options.length === 0) {
    return `Step ${step.id} needs options.`;
  }

  const ids = new Set(step.options.map((option) => option.id));

  if (
    ids.size !== step.options.length ||
    step.options.some(
      (option) => option.id.trim() === "" || option.label.trim() === ""
    )
  ) {
    return `Step ${step.id} has empty or duplicate options.`;
  }

  if (step.type === "single-select") {
    return undefined;
  }

  const minimum = step.min ?? 1;
  const maximum = step.max ?? ids.size;

  if (
    !Number.isInteger(minimum) ||
    !Number.isInteger(maximum) ||
    minimum < 0 ||
    maximum < minimum ||
    maximum > ids.size
  ) {
    return `Step ${step.id} has invalid selection limits.`;
  }

  return undefined;
};

const screenError = (step: FunnelStep): string | undefined => {
  if (step.id.trim() === "" || step.title.trim() === "") {
    return "Screen IDs and titles must not be empty.";
  }

  if (step.type === "single-select" || step.type === "multi-select") {
    return choiceError(step);
  }

  if (
    step.type === "number" &&
    step.min !== undefined &&
    step.max !== undefined &&
    step.min > step.max
  ) {
    return `Step ${step.id} has its minimum above its maximum.`;
  }

  if (
    step.type === "result" &&
    (step.cta === undefined || step.cta.label.trim() === "")
  ) {
    return `Result ${step.id} needs a CTA label and URL.`;
  }

  return undefined;
};

const destinations = (step: FunnelStep): readonly string[] => {
  if (step.transition !== undefined) {
    return [
      step.transition.default,
      ...step.transition.branches.map((branch) => branch.next),
    ];
  }

  return step.next === undefined ? [] : [step.next];
};

const conditionError = (
  condition: Condition,
  steps: ReadonlyMap<string, FunnelStep>
): string | undefined => {
  const source = steps.get(condition.stepId);

  if (source === undefined) {
    return `Condition references missing step ${condition.stepId}.`;
  }

  switch (condition.operator) {
    case "equals":
    case "includes": {
      const expectedType =
        condition.operator === "equals" ? "single-select" : "multi-select";

      return source.type === expectedType &&
        source.options?.some((option) => option.id === condition.value) === true
        ? undefined
        : `Condition on ${source.id} must reference a ${expectedType} option.`;
    }

    case "gte": {
      return source.type === "number" &&
        (source.max === undefined || condition.value <= source.max)
        ? undefined
        : `Condition on ${source.id} cannot match its numeric constraints.`;
    }

    case "lte": {
      return source.type === "number" &&
        (source.min === undefined || condition.value >= source.min)
        ? undefined
        : `Condition on ${source.id} cannot match its numeric constraints.`;
    }

    default: {
      return "Unsupported condition operator.";
    }
  }
};

const transitionError = (
  step: FunnelStep,
  steps: ReadonlyMap<string, FunnelStep>
): string | undefined => {
  if (step.type === "result") {
    return destinations(step).length === 0
      ? undefined
      : `Result ${step.id} cannot have a next step.`;
  }

  if (step.next !== undefined && step.transition !== undefined) {
    return `Step ${step.id} cannot have both next and transition.`;
  }

  if (destinations(step).length === 0) {
    return `Step ${step.id} needs a next step or an explicit default transition.`;
  }

  for (const target of destinations(step)) {
    if (!steps.has(target)) {
      return `Step ${step.id} references missing destination ${target}.`;
    }
  }

  for (const branch of step.transition?.branches ?? []) {
    const error = conditionError(branch.when, steps);

    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
};

const graphError = (configuration: FunnelConfiguration): string | undefined => {
  const steps = new Map(configuration.steps.map((step) => [step.id, step]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string): string | undefined => {
    if (visiting.has(id)) {
      return `The route contains a cycle at ${id}.`;
    }

    if (visited.has(id)) {
      return undefined;
    }

    const step = steps.get(id);

    if (step === undefined) {
      return `Missing step ${id}.`;
    }

    visiting.add(id);

    for (const target of destinations(step)) {
      const error = visit(target);

      if (error !== undefined) {
        return error;
      }
    }

    visiting.delete(id);
    visited.add(id);

    return undefined;
  };

  for (const step of configuration.steps) {
    const error = visit(step.id);

    if (error !== undefined) {
      return error;
    }
  }

  return undefined;
};

export const validateResolvedConfiguration = Effect.fn(
  "validateResolvedConfiguration"
)(function* validateResolvedConfiguration(configuration: FunnelConfiguration) {
  if (configuration.id.trim() === "" || configuration.name.trim() === "") {
    return yield* new ConfigurationInvalid({
      message: "Configuration ID and name must not be empty.",
    });
  }

  if (configuration.steps.length < 6) {
    return yield* new ConfigurationInvalid({
      message: "A configuration needs at least six screens.",
    });
  }

  const steps = new Map(configuration.steps.map((step) => [step.id, step]));

  if (steps.size !== configuration.steps.length) {
    return yield* new ConfigurationInvalid({
      message: "Screen IDs must be unique.",
    });
  }

  if (!steps.has(configuration.start)) {
    return yield* new ConfigurationInvalid({
      message: `The start step ${configuration.start} is missing.`,
    });
  }

  for (const step of configuration.steps) {
    const error = screenError(step) ?? transitionError(step, steps);

    if (error !== undefined) {
      return yield* new ConfigurationInvalid({ message: error });
    }

    if (step.cta !== undefined) {
      const url = yield* Schema.decodeEffect(Schema.URLFromString)(
        step.cta.href
      ).pipe(
        Effect.mapError(
          () =>
            new ConfigurationInvalid({
              message: `Step ${step.id} has an invalid CTA URL.`,
            })
        )
      );

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return yield* new ConfigurationInvalid({
          message: `Step ${step.id} needs an HTTP or HTTPS CTA URL.`,
        });
      }
    }
  }

  const error = graphError(configuration);

  if (error !== undefined) {
    return yield* new ConfigurationInvalid({ message: error });
  }

  return configuration;
});

export const validateConfiguration = flow(
  Schema.decodeUnknownEffect(FunnelConfigurationSchema, {
    onExcessProperty: "error",
  }),
  Effect.mapError(
    (issue) => new ConfigurationInvalid({ message: issue.message })
  ),
  Effect.flatMap(
    Effect.fnUntraced(function* validateVariants(configuration) {
      const eventError = eventDeclarationsError(configuration);

      if (eventError !== undefined) {
        return yield* new ConfigurationInvalid({ message: eventError });
      }

      yield* validateResolvedConfiguration(configuration);
      const ids = new Set(configuration.steps.map((step) => step.id));

      for (const variant of ["A", "B"] as const) {
        for (const [id, override] of Object.entries(
          configuration.variants?.[variant]?.steps ?? {}
        )) {
          if (
            override.next !== undefined &&
            override.transition !== undefined
          ) {
            return yield* new ConfigurationInvalid({
              message: `Variant ${variant} step ${id} must define one route rule.`,
            });
          }

          if (!ids.has(id)) {
            return yield* new ConfigurationInvalid({
              message: `Variant ${variant} overrides missing step ${id}.`,
            });
          }
        }

        yield* validateResolvedConfiguration(
          resolveVariant(configuration, variant)
        );
      }

      return configuration;
    })
  )
);
