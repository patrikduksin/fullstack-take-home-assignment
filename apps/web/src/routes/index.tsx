import { ClientOnly, createFileRoute } from "@tanstack/react-router";

import { Funnel } from "../features/funnel/funnel.js";

export const Route = createFileRoute("/")({
  component: () => (
    <ClientOnly fallback={<main>Loading your session…</main>}>
      <Funnel />
    </ClientOnly>
  ),
});
