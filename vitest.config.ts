import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Mirror repo `app`: jsdom + RTL, alias `@` → src. Test files live in tests/unit.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
