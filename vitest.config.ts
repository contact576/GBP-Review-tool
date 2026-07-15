import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws outside an RSC context; stub it so server modules
      // with pure helpers (Google mappers, sync builders) are unit-testable.
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
});
