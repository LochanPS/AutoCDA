import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// CRA → Vite. Two compatibility choices keep the rest of the repo and the deploy
// unchanged:
//  1. process.env shim: the app reads public config as `process.env.REACT_APP_*`
//     (CRA convention) and `process.env.NODE_ENV`. We inline those — and ONLY the
//     REACT_APP_* ones, so no secret (non-prefixed) env var is ever bundled.
//  2. assetsDir "static" + outDir "build": matches the existing vercel.json
//     (outputDirectory "build", Cache-Control on /static/(.*)).
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "REACT_APP_");
  const procEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith("REACT_APP_"))
  );
  const publicEnv = { ...fileEnv, ...procEnv };

  return {
    plugins: [react()],
    define: {
      "process.env": JSON.stringify({
        NODE_ENV: mode === "production" ? "production" : "development",
        ...publicEnv,
      }),
    },
    build: {
      outDir: "build",
      assetsDir: "static",
      // ngspice-wasm is a large base64-inlined chunk; don't warn on it.
      chunkSizeWarningLimit: 8000,
    },
    server: { port: 3000 },
    preview: { port: 3000 },
    test: {
      globals: true,
      environment: "jsdom",
      include: ["src/**/*.test.{js,jsx}"],
      // The ngspice engine and recharts aren't exercised by the unit tests (they
      // inject fakes / analytic models); keep tests fast and node-free.
    },
  };
});
