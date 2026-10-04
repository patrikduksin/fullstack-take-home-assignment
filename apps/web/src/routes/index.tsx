import { ClientOnly, createFileRoute } from "@tanstack/react-router";

import { Health } from "../features/health/health.js";

export const Route = createFileRoute("/")({
  component: () => (
    <main>
      <h1>Core</h1>
      <p>The starter is ready for your assignment.</p>
      <ClientOnly fallback={<p>Checking backend…</p>}>
        <Health />
      </ClientOnly>
    </main>
  ),
});
