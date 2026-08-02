import { defineConfig } from "vite";
import packageJson from "./package.json";

export default defineConfig({
  base: "/BarveGurujiAi/",
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    manifest: true,
    sourcemap: false,
    target: "es2022",
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: { reporter: ["text", "html"] },
  },
});
