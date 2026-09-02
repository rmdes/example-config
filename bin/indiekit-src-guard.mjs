#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

/**
 * Check that Indiekit resolved from the mounted source tree
 * @param {string} resolvedPath - Path `@indiekit/indiekit` resolved to
 * @param {string} srcRoot - Directory the source is mounted at
 * @returns {object} Result with `ok` and a `message`
 */
export const checkResolution = (resolvedPath, srcRoot) => {
  const relative = path.relative(srcRoot, resolvedPath);
  const inside =
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);

  if (inside) {
    return { ok: true, message: `Indiekit resolved from ${resolvedPath}` };
  }

  return {
    ok: false,
    message:
      `Indiekit resolved to ${resolvedPath}, outside ${srcRoot}.\n` +
      `The mounted tree has no node_modules, so Node resolved up to the parent ` +
      `checkout — the container would serve that branch, not the mounted one.\n` +
      `Fix: run \`npm install\` in the mounted directory, then restart.`,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const srcRoot = process.env.INDIEKIT_SRC_ROOT ?? "/src/indiekit";
  const require = createRequire(`${srcRoot}/`);

  let resolved;
  try {
    resolved = require.resolve("@indiekit/indiekit");
  } catch {
    console.error(`Cannot resolve @indiekit/indiekit from ${srcRoot}.`);
    console.error("Fix: run `npm install` in the mounted directory.");
    process.exit(1);
  }

  const result = checkResolution(resolved, srcRoot);
  console.log(result.message);
  if (!result.ok) {
    process.exit(1);
  }

  try {
    const ref = execFileSync("git", ["-C", srcRoot, "rev-parse", "--abbrev-ref", "HEAD"])
      .toString()
      .trim();
    const sha = execFileSync("git", ["-C", srcRoot, "rev-parse", "--short", "HEAD"])
      .toString()
      .trim();
    console.log(`Indiekit source: ${ref} @ ${sha}`);
  } catch {
    console.log("Indiekit source: ref unknown (no git metadata in mount)");
  }
}
