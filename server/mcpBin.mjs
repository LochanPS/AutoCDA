#!/usr/bin/env node
/**
 * mcpBin.mjs — npm `bin` entry for `autocda-verify-mcp`.
 *
 * The MCP server reuses the app's source, which uses extensionless ESM imports
 * (`../sim/measure`). server/loader.mjs is a module resolver hook that adds the
 * `.js`. A `bin` can't apply a `--import` hook to itself, so we register the hook
 * in-process via node:module `register()`, then dynamically import the server — it
 * runs in THIS process on the same stdio, so there is no child to orphan and the
 * MCP client's signals reach it directly.
 *
 *   npx autocda-verify-mcp
 *
 * Requires Node >= 20.6 (for module.register).
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

try {
  register(pathToFileURL(join(here, "loader.mjs")).href);
} catch (e) {
  process.stderr.write(
    `autocda-verify-mcp: could not register the module loader (need Node >= 20.6) — ${e.message}\n`
  );
  process.exit(1);
}

await import(pathToFileURL(join(here, "mcpServer.mjs")).href);
