import Backend from "@core/backend/worker";
import * as Cloudflare from "alchemy/Cloudflare";

export class Website extends Cloudflare.Website.Vite<Website>()("CoreWebsite", {
  dev: { port: 3000 },
  env: { BACKEND: Backend },
  rootDir: new URL("../", import.meta.url).pathname,
}) {}
