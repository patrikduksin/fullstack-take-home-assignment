import { RegistryProvider } from "@effect/atom-react";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import "../styles.css";

export const Route = createRootRoute({
  component: () => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <RegistryProvider>
          <Outlet />
        </RegistryProvider>
        <Scripts />
      </body>
    </html>
  ),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "Core" },
    ],
  }),
});
