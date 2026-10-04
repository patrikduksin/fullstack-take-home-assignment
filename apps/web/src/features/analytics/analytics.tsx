import { FunnelError } from "@core/core/contracts";
import type {
  AnalyticsCohort,
  AnalyticsFilter,
  AnalyticsReport,
} from "@core/core/contracts";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";

import { getAnalytics } from "../../client/analytics.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Label } from "../../components/ui/label.js";
import {
  NativeSelect,
  NativeSelectOption,
} from "../../components/ui/native-select.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.js";

const percentage = (rate: number | null) =>
  rate === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
        style: "percent",
      }).format(rate);

const CohortDetails = ({ cohort }: { cohort: AnalyticsCohort }) => {
  const titles = new Map(cohort.steps.map((step) => [step.stepId, step.title]));

  return (
    <details
      aria-label={`${cohort.version} · Variant ${cohort.variant} · ${cohort.campaign ?? "No campaign"}`}
      className="bg-card rounded-xl border p-6"
    >
      <summary className="cursor-pointer font-medium">
        {cohort.version} · Variant {cohort.variant} ·{" "}
        {cohort.campaign ?? "No campaign"}
      </summary>
      <div className="mt-6 space-y-6">
        <Table aria-label="Step conversion">
          <TableCaption>
            Step completion: distinct viewers who completed / distinct viewers.
            Drop-off is viewers without completion at this snapshot.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Step</TableHead>
              <TableHead>Viewers</TableHead>
              <TableHead>Completers</TableHead>
              <TableHead>Completion</TableHead>
              <TableHead>Observed drop-off</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cohort.steps.map((step) => (
              <TableRow key={step.stepId}>
                <TableCell>
                  {step.title}
                  {step.terminal && (
                    <span className="text-muted-foreground block text-xs">
                      Result screen
                    </span>
                  )}
                </TableCell>
                <TableCell>{step.viewers}</TableCell>
                <TableCell>{step.completers}</TableCell>
                <TableCell>
                  {percentage(step.completionRate)} ({step.completers} /{" "}
                  {step.viewers})
                </TableCell>
                <TableCell>{step.dropOff}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-muted-foreground text-sm">
          Result screens have no completed transition; use result reach and CTA
          CTR to assess terminal engagement.
        </p>
        <Table aria-label="Eligible transitions">
          <TableCaption>
            Conversion: eligible sessions with a subsequent target view in the
            same route revision / sessions with a recorded eligible transition.
            Skipped steps add no eligible sessions.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Transition</TableHead>
              <TableHead>Eligible sessions</TableHead>
              <TableHead>Converted sessions</TableHead>
              <TableHead>Conversion</TableHead>
              <TableHead>Observed drop-off</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cohort.edges.map((edge) => (
              <TableRow key={`${edge.sourceStepId}:${edge.targetStepId}`}>
                <TableCell>
                  {titles.get(edge.sourceStepId) ?? edge.sourceStepId} →{" "}
                  {titles.get(edge.targetStepId) ?? edge.targetStepId}
                </TableCell>
                <TableCell>{edge.eligible}</TableCell>
                <TableCell>{edge.converted}</TableCell>
                <TableCell>
                  {percentage(edge.conversionRate)} ({edge.converted} /{" "}
                  {edge.eligible})
                </TableCell>
                <TableCell>{edge.dropOff}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
};

export const Analytics = () => {
  const [filter, setFilter] = useState<AnalyticsFilter>(() => {
    const campaign = new URLSearchParams(window.location.search).get(
      "campaign"
    );

    return campaign === null ? {} : { campaign };
  });

  const [report, setReport] = useState<AnalyticsReport>();
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string>();
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setPending(true);
    setError(undefined);
    void Effect.runPromise(
      getAnalytics(filter).pipe(
        Effect.match({
          onFailure: (failure) => {
            if (active) {
              setError(
                Schema.is(FunnelError)(failure)
                  ? failure.message
                  : "Could not load analytics. Please try again."
              );
              setPending(false);
            }
          },
          onSuccess: (next) => {
            if (active) {
              setReport(next);
              setPending(false);
            }
          },
        })
      )
    );

    return () => {
      active = false;
    };
  }, [filter, refresh]);

  const comparisons =
    report?.comparisons.filter(
      (comparison) =>
        filter.version !== undefined ||
        comparison.summary.started > 0 ||
        comparison.summary.resultViewers > 0
    ) ?? [];

  const cohorts =
    report?.cohorts.filter(
      (cohort) =>
        filter.version !== undefined ||
        cohort.summary.started > 0 ||
        cohort.summary.resultViewers > 0
    ) ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Funnel analytics</h1>
        <nav className="flex gap-4 text-sm underline">
          <a href="/internal/versions">Manage versions</a>
          <a href="/">Open funnel</a>
        </nav>
      </header>
      <p className="text-muted-foreground text-sm">
        Compare A and B within each version. All figures count distinct
        sessions. Observed drop-off counts sessions without recorded
        continuation at this snapshot.
      </p>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="analytics-version">Version</Label>
            <NativeSelect
              id="analytics-version"
              value={filter.version ?? ""}
              onChange={(change) => {
                setFilter({
                  ...filter,
                  version:
                    change.target.value === ""
                      ? undefined
                      : change.target.value,
                });
              }}
            >
              <NativeSelectOption value="">All versions</NativeSelectOption>
              {report?.versions.map((version) => (
                <NativeSelectOption
                  key={version.version}
                  value={version.version}
                >
                  {version.name} · {version.version}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="analytics-variant">Variant</Label>
            <NativeSelect
              id="analytics-variant"
              value={filter.variant ?? ""}
              onChange={(change) => {
                setFilter({
                  ...filter,
                  variant:
                    change.target.value === "A" || change.target.value === "B"
                      ? change.target.value
                      : undefined,
                });
              }}
            >
              <NativeSelectOption value="">A and B</NativeSelectOption>
              <NativeSelectOption value="A">A</NativeSelectOption>
              <NativeSelectOption value="B">B</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="analytics-campaign">Initial campaign</Label>
            <NativeSelect
              id="analytics-campaign"
              value={
                filter.campaign === undefined
                  ? ""
                  : JSON.stringify(
                      filter.campaign === "" ? null : filter.campaign
                    )
              }
              onChange={(change) => {
                setFilter({
                  ...filter,
                  campaign:
                    change.target.value === ""
                      ? undefined
                      : (report?.campaigns.find(
                          (campaign) =>
                            JSON.stringify(campaign) === change.target.value
                        ) ?? ""),
                });
              }}
            >
              <NativeSelectOption value="">All campaigns</NativeSelectOption>
              {report?.campaigns.map((campaign) => (
                <NativeSelectOption
                  key={JSON.stringify(campaign)}
                  value={JSON.stringify(campaign)}
                >
                  {campaign ?? "No campaign"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setRefresh((value) => value + 1);
            }}
          >
            Refresh snapshot
          </Button>
        </CardContent>
      </Card>
      {pending && <p role="status">Loading analytics…</p>}
      {error !== undefined && (
        <div
          role="alert"
          className="border-destructive space-y-3 rounded-md border p-4"
        >
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => {
              setRefresh((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {!pending && error === undefined && report !== undefined && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Card role="region" aria-label="Started sessions">
              <CardHeader>
                <CardTitle>Started sessions</CardTitle>
                <CardDescription>
                  Distinct sessions with a recorded start.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {report.summary.started}
                </p>
              </CardContent>
            </Card>
            <Card role="region" aria-label="Result reach">
              <CardHeader>
                <CardTitle>Result reach</CardTitle>
                <CardDescription>
                  Started sessions reaching a result / started sessions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {percentage(report.summary.resultReachRate)}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {report.summary.resultReached} / {report.summary.started}{" "}
                  started sessions
                </p>
              </CardContent>
            </Card>
            <Card role="region" aria-label="CTA CTR">
              <CardHeader>
                <CardTitle>CTA CTR</CardTitle>
                <CardDescription>
                  Result viewers with a CTA click / result viewers.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {percentage(report.summary.ctaCtr)}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {report.summary.ctaClickers} / {report.summary.resultViewers}{" "}
                  result viewers
                </p>
              </CardContent>
            </Card>
          </section>
          <Card role="region" aria-label="Variant comparison">
            <CardHeader>
              <CardTitle>Variants within each version</CardTitle>
              <CardDescription>
                Campaign filters apply to these distinct-session totals. Version
                rows remain separate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableCaption>
                  Result reach denominator: started sessions. CTA CTR
                  denominator: result viewers.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Result reach</TableHead>
                    <TableHead>CTA CTR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisons.map((comparison) => (
                    <TableRow
                      key={`${comparison.version}:${comparison.variant}`}
                    >
                      <TableCell>
                        {comparison.name}
                        <span className="text-muted-foreground block text-xs">
                          {comparison.version}
                        </span>
                      </TableCell>
                      <TableCell>{comparison.variant}</TableCell>
                      <TableCell>{comparison.summary.started}</TableCell>
                      <TableCell>
                        {percentage(comparison.summary.resultReachRate)} (
                        {comparison.summary.resultReached} /{" "}
                        {comparison.summary.started})
                      </TableCell>
                      <TableCell>
                        {percentage(comparison.summary.ctaCtr)} (
                        {comparison.summary.ctaClickers} /{" "}
                        {comparison.summary.resultViewers})
                      </TableCell>
                    </TableRow>
                  ))}
                  {comparisons.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        No sessions match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <section
            className="space-y-4"
            aria-label="Step and transition metrics"
          >
            <h2 className="text-lg font-semibold">
              Steps and eligible transitions by cohort
            </h2>
            <p className="text-muted-foreground text-sm">
              Open a version, variant and initial campaign cohort to inspect its
              own denominators. Repeated views, Back, and historical route
              revisions contribute each session once.
            </p>
            {cohorts.map((cohort) => (
              <CohortDetails
                key={JSON.stringify([
                  cohort.version,
                  cohort.variant,
                  cohort.campaign,
                ])}
                cohort={cohort}
              />
            ))}
          </section>
          <p className="text-muted-foreground text-xs">
            Captured at {report.capturedAt}. Zero denominators display an
            unavailable rate.
          </p>
        </>
      )}
    </main>
  );
};
