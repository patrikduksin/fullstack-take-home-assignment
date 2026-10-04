import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { backendHealth } from "../../client/health.js";

export const Health = () => {
  const result = useAtomValue(backendHealth);

  return AsyncResult.match(result, {
    onFailure: () => (
      <p role="alert">Backend unavailable. Start the backend and try again.</p>
    ),
    onInitial: () => <p>Checking backend…</p>,
    onSuccess: ({ value }) => (
      <p>
        Backend {value.status}. Database {value.database}.
      </p>
    ),
  });
};
