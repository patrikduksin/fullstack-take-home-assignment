import { ClientOnly, createFileRoute } from "@tanstack/react-router";

import { Health } from "../features/health/health.js";

export const Route = createFileRoute("/health")({
  component: () => (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-12">
      <h1 className="text-xl font-semibold">Service health</h1>
      <ClientOnly fallback={<p>Checking backend…</p>}>
        <Health />
      </ClientOnly>
    </main>
  ),
});
