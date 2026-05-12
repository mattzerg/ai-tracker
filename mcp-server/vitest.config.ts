import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    // Live MCP integration tests gated by RUN_MCP_TESTS=1.
  },
});
