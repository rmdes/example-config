import process from "node:process";

import config from "../indiekit.config.js";

/**
 * The published configuration, with only the GitHub API endpoint redirected at
 * the stub in `test/github-stub.mjs`. Everything else — plug-ins, preset,
 * publication and syndicator options — is exactly what this repository ships,
 * so the smoke test exercises the real configuration rather than a copy of it.
 */
config["@indiekit/store-github"].baseUrl = process.env.GITHUB_API_URL;

export default config;
