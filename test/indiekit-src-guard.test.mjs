import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { checkResolution } from "../bin/indiekit-src-guard.mjs";

describe("indiekit-src-guard", () => {
  it("Accepts a package resolved inside the mounted source", () => {
    const result = checkResolution(
      "/src/indiekit/packages/indiekit/index.js",
      "/src/indiekit",
    );

    assert.equal(result.ok, true);
  });

  it("Rejects a package resolved outside the mounted source", () => {
    // A worktree has no node_modules, so Node resolves up to the parent
    // checkout and the container would serve the parent's branch.
    const result = checkResolution(
      "/home/rmdes/indiekit/indiekit-origin/packages/indiekit/index.js",
      "/src/indiekit",
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /npm install/);
  });

  it("Rejects a prefix that only looks like the source root", () => {
    const result = checkResolution("/src/indiekit-other/index.js", "/src/indiekit");

    assert.equal(result.ok, false);
  });
});
