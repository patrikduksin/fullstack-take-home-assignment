import Backend from "@core/backend/worker";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Effect } from "effect";

import { Website } from "../web/src/website.js";

export default Alchemy.Stack(
  "Core",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* stack() {
    yield* Backend;
    const website = yield* Website;

    return { websiteUrl: website.url };
  })
);
