import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{js,jsx}"],
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ["default"],
  },
});
