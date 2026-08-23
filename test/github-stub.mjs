import http from "node:http";

/**
 * A stand-in for the GitHub contents API, holding files in memory.
 *
 * `@indiekit/store-github` takes a `baseUrl`, so pointing it here exercises the
 * real store, preset and Micropub endpoint without a token, a network call, or
 * a write to anybody’s repository.
 * The port is fixed rather than ephemeral: Indiekit is started before the test
 * runs and needs the URL up front.
 * @see {@link https://docs.github.com/en/rest/repos/contents}
 * @param {number} port - Port to listen on
 * @returns {Promise<object>} Server, its base URL, and the files it holds
 */
export const startGithubStub = async (port) => {
  /** @type {Map<string, {content: string, sha: string}>} */
  const files = new Map();
  /** @type {object[]} Bodies of every write, so the test can check the store
   * sent what the GitHub API actually requires, not merely that it sent
   * something this permissive stub was willing to accept. */
  const writes = [];
  let counter = 0;

  const server = http.createServer((request, response) => {
    // Everything after `/contents/`, minus the `?ref=` the store appends
    const [pathname] = request.url.split("?");
    const filePath = decodeURIComponent(
      pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ""),
    );

    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const sent = body ? JSON.parse(body) : {};

      switch (request.method) {
        case "GET": {
          const file = files.get(filePath);
          // A miss must not be 2xx: `createFile` reads this to decide whether
          // the file already exists, and would skip the write if it were.
          return file ? send(200, file) : send(404, { message: "Not Found" });
        }

        case "PUT": {
          const sha = `sha${++counter}`;
          writes.push({ filePath, ...sent });
          files.set(filePath, { content: sent.content, sha });
          return send(201, {
            content: { html_url: `https://github.example/${filePath}`, sha },
          });
        }

        case "DELETE": {
          files.delete(filePath);
          return send(200, { commit: { sha: `sha${++counter}` } });
        }

        default: {
          return send(405, { message: "Method Not Allowed" });
        }
      }
    });
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    /** @returns {string|undefined} Decoded file content */
    read: (filePath) => {
      const file = files.get(filePath);
      return file && Buffer.from(file.content, "base64").toString("utf8");
    },
    paths: () => [...files.keys()],
    writes: () => writes,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};
