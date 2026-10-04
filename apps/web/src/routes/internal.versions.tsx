import { ClientOnly, createFileRoute } from "@tanstack/react-router";

import { Versions } from "../features/versions/versions.js";

export const Route = createFileRoute("/internal/versions")({
  component: () => (
    <ClientOnly fallback={<main>Loading version history…</main>}>
      <Versions />
    </ClientOnly>
  ),
});
