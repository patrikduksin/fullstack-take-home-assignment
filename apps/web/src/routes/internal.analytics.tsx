import { ClientOnly, createFileRoute } from "@tanstack/react-router";

import { Analytics } from "../features/analytics/analytics.js";

export const Route = createFileRoute("/internal/analytics")({
  component: () => (
    <ClientOnly fallback={<main>Loading analytics…</main>}>
      <Analytics />
    </ClientOnly>
  ),
});
