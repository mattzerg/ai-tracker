import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["schemas/**/*.test.ts", "src/**/*.test.ts", "scripts/**/*.test.ts", "worker/tests/**/*.test.ts"],
    environment: "node",
  },
});
