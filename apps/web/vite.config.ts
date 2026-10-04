import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: process.env.VITEST === "true" ? `dist/test-${process.pid}` : "dist",
    rolldownOptions: { external: ["cloudflare:workers"] },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
