// Node ESM resolver hook: the app's source uses extensionless relative imports
// (webpack-style, e.g. `from "../spec/circuitSpec"`). This lets Node import those
// same modules unchanged by retrying with a ".js" extension — so the server
// reuses the real design/verify code with zero duplication and no bundler.
import { register } from "node:module";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?jsx?$|\.json$/i.test(specifier)) {
    try {
      return await next(specifier + ".js", context);
    } catch {
      // fall through to default resolution
    }
  }
  return next(specifier, context);
}

// Self-register when used via `node --import ./server/loader.mjs`.
register("./loader.mjs", import.meta.url);
