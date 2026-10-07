/**
 * buildMcp.mjs — bundle the MCP server into a single publishable file.
 *
 * The MCP server reuses the app source (extensionless relative ESM imports).
 * esbuild follows those relative imports and inlines them, resolving the missing
 * `.js` at build time, so the published artifact is ONE file with a shebang and no
 * test/app bulk. Node-module deps (eecircuit-engine) stay external and are
 * installed from `dependencies` at `npx` time. Run by `npm run build:mcp` and by
 * the `prepack` lifecycle before publish.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["server/mcpServer.mjs"],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external", // keep node_modules deps (eecircuit-engine) external
  outfile: "dist/mcp.mjs",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
console.log("built dist/mcp.mjs");
