import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The domain layer is pure: no DOM, no database, no network.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
