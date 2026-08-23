import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import process from "node:process";

import jwt from "jsonwebtoken";

import { startGithubStub } from "./github-stub.mjs";

if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = Number(process.env.SMOKE_PORT || 3010);
const API_PORT = Number(process.env.GITHUB_API_PORT || 3001);
const INDIEKIT = `http://localhost:${PORT}`;
const SITE = process.env.PUBLICATION_URL;
const SECRET = process.env.SECRET;
const MARKER = `SMOKE_${Math.random().toString(36).slice(2, 10)}`;

if (!SECRET || !SITE) {
  console.error("SECRET and PUBLICATION_URL must be set; see .env.example.");
  process.exit(1);
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Run an assertion; a throw becomes a FAIL for `name` rather than a crash. */
const step = async (name, fn) => {
  try {
    await fn();
  } catch (error) {
    check(name, false, error.message);
  }
};

/**
 * Refuse to run if the port is taken. Otherwise the server this test starts
 * would fail to bind, the poll below would succeed against whatever is already
 * listening, and the publish would land in a server this test does not own.
 * @param {number} port - Port to test
 * @returns {Promise<boolean>} Port is free
 */
const portIsFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });

for (const [port, what] of [
  [PORT, "Indiekit"],
  [API_PORT, "the GitHub stub"],
]) {
  if (!(await portIsFree(port))) {
    console.error(
      `Port ${port} is in use, and this test needs it for ${what}.\n` +
        `It starts its own server rather than publishing into one it did not\n` +
        `start. Stop what is listening, or set SMOKE_PORT / GITHUB_API_PORT.`,
    );
    process.exit(1);
  }
}

const github = await startGithubStub(API_PORT);

/**
 * This test publishes and deletes, so it starts the server it tests rather
 * than trusting one to already be running. An externally started Indiekit
 * could be configured against the real GitHub API, and the publish would land
 * in a repository we do not own before anything could notice.
 *
 * `PASSWORD_SECRET` only has to be present: Indiekit redirects every route to
 * first-run setup without it, and compares it only when signing in with a
 * password, which this test never does.
 */
const server = spawn(
  "node",
  [
    "node_modules/.bin/indiekit",
    "serve",
    "--config",
    "test/indiekit.config.ci.js",
    "--port",
    String(PORT),
  ],
  {
    env: {
      ...process.env,
      GITHUB_API_URL: github.baseUrl,
      PASSWORD_SECRET: "smoke-test-never-compared",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => (serverOutput += chunk));
}

const shutDown = async () => {
  server.kill();
  await github.close();
};

const waitForServer = async (timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited (${server.exitCode}):\n${serverOutput}`);
    }
    try {
      await fetch(`${INDIEKIT}/`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`server never answered on ${INDIEKIT}:\n${serverOutput}`);
};

try {
  await waitForServer();
} catch (error) {
  console.error(error.message);
  await shutDown();
  process.exit(1);
}

const token = jwt.sign({ me: SITE, scope: "create delete" }, SECRET, {
  expiresIn: "10m",
});

const micropub = (body) =>
  fetch(`${INDIEKIT}/micropub`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });

const query = async (q) => {
  const response = await fetch(`${INDIEKIT}/micropub?q=${q}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`q=${q} returned ${response.status}`);
  return response.json();
};

let created, location, filePath;

await step("publish returns 202", async () => {
  created = await micropub({ h: "entry", content: `${MARKER} smoke test` });
  check("publish returns 202", created.status === 202, `got ${created.status}`);
});

await step("response carries a Location header", async () => {
  if (!created) throw new Error("no response from publish request");
  location = created.headers.get("location");
  check(
    "response carries a Location header",
    Boolean(location),
    location || "none",
  );
});

await step("post is filed in the preset's collection", async () => {
  [filePath] = github.paths();
  // @indiekit/preset-jekyll files each post type in its own Jekyll collection
  const expected = /^_notes\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/;
  check(
    "post is filed in the preset's collection",
    expected.test(String(filePath)),
    String(filePath),
  );
});

await step("stored file contains this run's marker", async () => {
  if (!filePath) throw new Error("nothing was written to the store");
  const content = github.read(filePath) || "";
  check(
    "stored file contains this run's marker",
    content.includes(MARKER),
    MARKER,
  );
});

// A stub accepts whatever it is sent, so without this the test would pass on a
// request the real API would reject.
await step("write is a request the GitHub API would accept", async () => {
  const [write] = github.writes();
  if (!write) throw new Error("the store made no write");
  const valid =
    write.branch === (process.env.GITHUB_BRANCH || "main") &&
    typeof write.message === "string" &&
    write.message.length > 0 &&
    Buffer.from(write.content, "base64").toString("base64") === write.content;
  check(
    "write is a request the GitHub API would accept",
    valid,
    `branch=${write.branch} message=${JSON.stringify(write.message)}`,
  );
});

await step("q=config advertises post types", async () => {
  const config = await query("config");
  const types = (config["post-types"] || []).map((type) => type.type);
  check(
    "q=config advertises post types",
    types.includes("note"),
    types.join(", "),
  );
});

await step("q=syndicate-to advertises the syndicator", async () => {
  const { "syndicate-to": targets = [] } = await query("syndicate-to");
  check(
    "q=syndicate-to advertises the syndicator",
    targets.length > 0,
    targets.map((target) => target.uid).join(", "),
  );
});

await step("deleting the post removes it from the store", async () => {
  if (!location) throw new Error("no Location header to delete");
  const deleted = await micropub({ action: "delete", url: location });
  if (!deleted.ok) {
    throw new Error(
      `delete returned ${deleted.status}: ${(await deleted.text()).slice(0, 200)}`,
    );
  }
  check(
    "deleting the post removes it from the store",
    !github.paths().includes(filePath),
    String(filePath),
  );
});

await shutDown();

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} assertions passed`);
process.exit(failed === 0 ? 0 : 1);
