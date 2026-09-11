import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

// The resolved compose config for the reference-theme starter, as Docker sees
// it. Asserting the resolved output rather than the YAML catches merge
// surprises between the base file and the override.
const resolved = () =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-f",
        "starters/reference-theme.yml",
        "config",
        "--format",
        "json",
      ],
      { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" },
    ),
  );

const targets = (service) =>
  (service.volumes ?? []).map((volume) => volume.target);

const POST_DIRECTORIES = [
  "articles",
  "bookmarks",
  "likes",
  "notes",
  "photos",
  "replies",
  "media",
];

describe("starters/reference-theme", () => {
  it("Keeps posts out of the theme checkout", () => {
    const indiekit = resolved().services.indiekit;

    // content/ in the theme is its Eleventy source as well as its post
    // directories — index.liquid, _css, _fixtures and the templates live
    // there. Writing posts into it makes the checkout dirty and mixes
    // generated content with the theme's own files.
    for (const volume of indiekit.volumes ?? []) {
      assert.equal(
        /indiekit-theme-eleventy-reference\/content/.test(volume.source ?? ""),
        false,
        `indiekit writes into the theme checkout: ${volume.source}`,
      );
    }
  });

  it("Mounts each post directory into the theme separately", () => {
    const site = resolved().services.site;
    const mounted = targets(site);

    for (const directory of POST_DIRECTORIES) {
      assert.equal(
        mounted.includes(`/site/content/${directory}`),
        true,
        `site is missing a mount for content/${directory}`,
      );
    }
  });

  it("Gives Indiekit a writable store where its config looks for one", () => {
    const indiekit = resolved().services.indiekit;
    const store = (indiekit.volumes ?? []).find(
      (volume) => volume.target === "/usr/src/app/content",
    );

    // The theme's indiekit.config.js sets the file-system store to
    // "./content", resolved against the image's WORKDIR.
    assert.ok(store, "no store mounted at /usr/src/app/content");
    assert.equal(store.read_only ?? false, false, "store is read-only");

    // It must be this repo's own store root, not the theme's content.
    assert.match(store.source, /example-config-local\/content$/);
  });

  it("Serves the site and the store from one host name", () => {
    const indiekit = resolved().services.indiekit;

    // Signing in makes Indiekit fetch its own PUBLICATION_URL from inside the
    // container, where `localhost` is the container itself. Mapping the site
    // host to the Docker host is what lets sign-in complete.
    assert.ok(
      indiekit.extra_hosts,
      "indiekit has no extra_hosts, so sign-in cannot reach the site",
    );
  });

  it("Hides the theme's sample posts", () => {
    const site = resolved().services.site;

    // The samples exist for the theme's own test suite. A site fed by a real
    // Indiekit should render only real posts.
    assert.equal(site.environment.THEME_SAMPLE_POSTS, "0");
  });
});
