import Backend from "@core/backend/worker";
import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect } from "effect";

export class Website extends Cloudflare.Website.Vite<Website>()(
  "CoreWebsite",
  Effect.gen(function* website() {
    const stage = yield* Stage;

    const properties = {
      env: { BACKEND: Backend },
      rootDir: new URL("../", import.meta.url).pathname,
    };

    if (stage === "tha2-demo") {
      return { ...properties, domain: "tha2.app" };
    }

    return properties;
  })
) {}
