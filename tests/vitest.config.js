import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.test.js"],
    silent: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "../src"),
      "open-sse": resolve(__dirname, "../open-sse"),
      // Resolve @/* imports to src directory
      "@": resolve(__dirname, "../src"),
    },
  },
});
