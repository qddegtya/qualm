import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
      // A floor that catches untested files, not a target to game.
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
