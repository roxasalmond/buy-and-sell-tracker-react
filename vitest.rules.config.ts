import { defineConfig } from "vitest/config";

// Security-rule tests: they need the Firebase emulators running, so they are not part of `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    // One file, run in order, against one shared emulator.
    fileParallelism: false,
  },
});
