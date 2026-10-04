import { VersionError } from "@core/core/contracts";
import type { VersionState } from "@core/core/contracts";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";

import {
  listVersions,
  publishVersion,
  readConfiguration,
  rollbackVersion,
} from "../../client/versions.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Input } from "../../components/ui/input.js";
import { Label } from "../../components/ui/label.js";

export const Versions = () => {
  const [state, setState] = useState<VersionState>();
  const [file, setFile] = useState<File>();
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const perform = (
    operation: ReturnType<typeof listVersions>,
    success?: string
  ) => {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
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
              Schema.is(VersionError)(failure)
                ? failure.message
                : "Could not reach the server. Please try again."
            );
          },
          onSuccess: (next) => {
            setState(next);
            setNotice(success);
          },
        })
      )
    );
  };

  useEffect(() => {
    perform(listVersions());
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Funnel versions</h1>
        <nav className="flex gap-4 text-sm underline">
          <a href="/internal/analytics">View analytics</a>
          <a href="/">Open funnel</a>
        </nav>
      </header>
      <p className="text-muted-foreground text-sm">
        Internal demonstration. Published versions are immutable. Existing
        sessions keep their original version.
      </p>
      {error !== undefined && (
        <p
          role="alert"
          className="border-destructive text-destructive rounded-md border p-4 text-sm"
        >
          {error}
        </p>
      )}
      {notice !== undefined && (
        <p role="status" className="rounded-md border p-4 text-sm">
          {notice}
        </p>
      )}
      <Card role="region" aria-label="Active version">
        <CardHeader>
          <CardTitle>Active version</CardTitle>
          <CardDescription>
            {state?.activeVersion ?? "Loading version history…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              perform(listVersions());
            }}
          >
            Refresh versions
          </Button>
          <Button
            variant="outline"
            disabled={
              pending ||
              state === undefined ||
              state.history[0]?.previousVersion === null
            }
            onClick={() => {
              perform(
                rollbackVersion(),
                "Previous activation restored. Existing sessions keep their pinned versions."
              );
            }}
          >
            Roll back
          </Button>
        </CardContent>
      </Card>
      {state?.history[0]?.previousVersion === null && (
        <p className="text-muted-foreground text-sm">
          No previous activation is available. Publish a new version before
          rolling back.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Publish configuration</CardTitle>
          <CardDescription>
            Upload a JSON configuration with a new ID. Publication validates
            both variants and activates the version without deployment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="configuration">Configuration JSON</Label>
            <Input
              id="configuration"
              type="file"
              accept=".json,application/json"
              disabled={pending}
              onChange={(event) => {
                setFile(event.target.files?.[0]);
              }}
            />
          </div>
          <Button
            disabled={pending || file === undefined}
            onClick={() => {
              if (file !== undefined) {
                perform(
                  readConfiguration(file).pipe(Effect.flatMap(publishVersion)),
                  "Configuration published. New sessions use the active version."
                );
              }
            }}
          >
            Publish version
          </Button>
        </CardContent>
      </Card>
      {state !== undefined && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Saved versions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {state.versions.map((version) => (
                  <li
                    key={version.version}
                    className="flex flex-wrap justify-between gap-3 py-3"
                  >
                    <span>
                      {version.name}{" "}
                      <span className="text-muted-foreground text-sm">
                        {version.version}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {version.createdAt} UTC
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Activation history">
            <CardHeader>
              <CardTitle>Activation history</CardTitle>
              <CardDescription>
                Newest first. History starts when version management was
                introduced.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="divide-y">
                {state.history.map((activation) => (
                  <li key={activation.sequence} className="space-y-1 py-3">
                    <p className="text-sm">
                      {activation.kind} · {activation.version}
                      {activation.previousVersion !== null && (
                        <> · previous {activation.previousVersion}</>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {activation.activatedAt} UTC
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
};
