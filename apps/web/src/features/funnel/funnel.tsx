import { AnswerSchema, FunnelError } from "@core/core/contracts";
import type { Answer, FunnelStep, SessionView } from "@core/core/contracts";
import { Effect, Option, Schema } from "effect";
import { useEffect, useRef, useState } from "react";

import {
  recordAdvance,
  recordBack,
  recordCta,
  recordDisplayedStep,
  startEventDelivery,
} from "../../client/events.js";
import {
  startSession,
  loadSession,
  advanceSession,
  backSession,
} from "../../client/funnel.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Input } from "../../components/ui/input.js";
import { Label } from "../../components/ui/label.js";

const storageKey = "funnel-session";

const startSessionFromQuery = () =>
  startSession(
    new URLSearchParams(window.location.search).get("variant") ?? undefined
  );

const draftKey = (sessionId: string, stepId: string) =>
  `funnel-draft:${sessionId}:${stepId}`;

const decodeDraft = Schema.decodeUnknownOption(
  Schema.fromJsonString(AnswerSchema)
);

const StepInput = ({
  step,
  answer,
  change,
}: {
  step: FunnelStep;
  answer: Answer;
  change: (answer: Answer) => void;
}) => {
  switch (step.type) {
    case "single-select":
    case "multi-select": {
      return (
        <fieldset className="space-y-3">
          <legend className="sr-only">{step.title}</legend>
          {step.options?.map((option) => {
            const multiple = step.type === "multi-select";

            const selected = Schema.is(Schema.Array(Schema.String))(answer)
              ? answer
              : [];

            return (
              <Label
                key={option.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-4"
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={step.id}
                  checked={
                    multiple
                      ? selected.includes(option.id)
                      : answer === option.id
                  }
                  onChange={(event) => {
                    if (!multiple) {
                      change(option.id);

                      return;
                    }

                    const next = event.target.checked
                      ? [...selected, option.id]
                      : selected.filter((value) => value !== option.id);

                    change(next);
                  }}
                />
                {option.label}
              </Label>
            );
          })}
        </fieldset>
      );
    }

    case "number": {
      return (
        <div className="space-y-2">
          <Label htmlFor={step.id}>{step.title}</Label>
          <Input
            id={step.id}
            type="number"
            min={step.min}
            max={step.max}
            value={Schema.is(Schema.Finite)(answer) ? answer : ""}
            onChange={(event) => {
              change(
                event.target.value === "" ? null : event.target.valueAsNumber
              );
            }}
          />
        </div>
      );
    }

    case "information":
    case "result": {
      return null;
    }

    default: {
      throw new Error("Unsupported screen type.");
    }
  }
};

export const Funnel = () => {
  const [view, setView] = useState<SessionView>();
  const [answer, setAnswer] = useState<Answer>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string>();
  const displayedVisit = useRef<string | null>(null);

  const restore = (next: SessionView) => {
    for (const step of next.configuration.steps) {
      if (!next.route.includes(step.id)) {
        localStorage.removeItem(draftKey(next.session.id, step.id));
      }
    }

    localStorage.setItem(storageKey, next.session.id);
    setView(next);

    const draft = localStorage.getItem(
      draftKey(next.session.id, next.session.currentStep)
    );

    setAnswer(
      Option.getOrElse(
        decodeDraft(draft),
        () => next.session.answers[next.session.currentStep] ?? null
      )
    );
  };

  const perform = (
    operation: ReturnType<typeof startSession>,
    navigation?: "advance" | "back"
  ) => {
    setPending(true);
    setError(undefined);
    void Effect.runPromise(
      operation.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            setPending(false);
          })
        ),
        Effect.match({
          onFailure: (failure) => {
            setError(
              Schema.is(FunnelError)(failure)
                ? failure.message
                : "Could not reach the server. Your edits are saved in this browser. Try again."
            );
          },
          onSuccess: (next) => {
            if (navigation === "advance" && view !== undefined) {
              localStorage.removeItem(
                draftKey(view.session.id, view.session.currentStep)
              );
              recordAdvance(view, next);
            }

            if (navigation === "back" && view !== undefined) {
              recordBack(view, next);
            }

            restore(next);
          },
        })
      )
    );
  };

  useEffect(startEventDelivery, []);

  useEffect(() => {
    if (view === undefined) {
      return;
    }

    const visit = `${view.session.id}:${view.session.currentStep}:${view.session.routeRevision}`;

    if (displayedVisit.current !== visit) {
      displayedVisit.current = visit;
      recordDisplayedStep(view);
    }
  }, [view]);

  useEffect(() => {
    const id = localStorage.getItem(storageKey);
    perform(id === null ? startSessionFromQuery() : loadSession(id));
  }, []);

  const step = view?.configuration.steps.find(
    (candidate) => candidate.id === view.session.currentStep
  );

  const change = (next: Answer) => {
    if (view === undefined) {
      return;
    }

    localStorage.setItem(
      draftKey(view.session.id, view.session.currentStep),
      JSON.stringify(next)
    );
    setAnswer(next);
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          {view?.configuration.name ?? "Funnel Runtime"}
        </h1>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            perform(startSessionFromQuery());
          }}
        >
          Start new session
        </Button>
      </header>
      <a
        className="text-muted-foreground text-sm underline"
        href="/internal/versions"
      >
        Manage versions
      </a>
      {error !== undefined && (
        <div
          role="alert"
          className="border-destructive text-destructive rounded-md border p-4 text-sm"
        >
          {error}
        </div>
      )}
      {view === undefined || step === undefined ? (
        <Card>
          <CardContent className="pt-6">
            <p role="status">
              {pending
                ? "Loading your session…"
                : "Your session is unavailable."}
            </p>
            {!pending && (
              <Button
                className="mt-4"
                onClick={() => {
                  const id = localStorage.getItem(storageKey);
                  perform(
                    id === null ? startSessionFromQuery() : loadSession(id)
                  );
                }}
              >
                Try again
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Step {view.route.indexOf(view.session.currentStep) + 1} of{" "}
            {view.route.length}
          </p>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{step.title}</h2>
              </CardTitle>
              {step.body !== undefined && (
                <CardDescription>{step.body}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <StepInput step={step} answer={answer} change={change} />
            </CardContent>
            <CardFooter className="justify-between gap-4">
              <Button
                variant="outline"
                disabled={pending || view.session.history.length === 0}
                onClick={() => {
                  perform(backSession(view.session.id), "back");
                }}
              >
                Back
              </Button>
              {step.type === "result" ? (
                <Button asChild>
                  <a
                    href={step.cta?.href}
                    onClick={() => {
                      recordCta(view);
                    }}
                  >
                    {step.cta?.label}
                  </a>
                </Button>
              ) : (
                <Button
                  disabled={pending}
                  onClick={() => {
                    perform(
                      advanceSession(
                        view.session.id,
                        step.id,
                        step.type === "information" ? null : answer
                      ),
                      "advance"
                    );
                  }}
                >
                  {pending ? "Saving…" : "Continue"}
                </Button>
              )}
            </CardFooter>
          </Card>
          <p className="text-muted-foreground text-xs">
            Fictional demonstration · Version {view.session.version} · Variant{" "}
            {view.session.variant}
          </p>
        </>
      )}
    </main>
  );
};
