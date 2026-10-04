import { createFileRoute } from "@tanstack/react-router";

import { proxy } from "../server/proxy.js";

export const Route = createFileRoute("/api/$")({
  server: { handlers: { ANY: proxy } },
});
