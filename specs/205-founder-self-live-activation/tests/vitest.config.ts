import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["specs/205-founder-self-live-activation/tests/**/*.test.ts"],
  },
});
