import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Only *.test.ts files run in CI. Files named *.integration.ts are
    // intentionally excluded — they require a live database and must be run
    // manually with `npx tsx <path>`. See the file header for prerequisites.
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
