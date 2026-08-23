# The SSG starter testbed

This branch turns `example-config` into a switchable testbed for the three Indiekit
SSG starter templates. One command repoints the whole stack — Indiekit, the generator,
the web server and the database — at a different starter repository:

```sh
./use-starter            # show which is active
./use-starter eleventy   # getindiekit/eleventy-starter
./use-starter hugo       # getindiekit/hugo-starter
./use-starter jekyll     # getindiekit/jekyll-starter
./use-starter local      # this repo's own ./eleventy scaffold
```

`docker-compose.yml` and the `Dockerfile` are untouched from upstream. The root
`indiekit.config.js` is repointed at the Eleventy scaffold with the file-system store,
so `./use-starter local` runs without GitHub or Mastodon credentials. The switching
lives in `starters/*.yml`, which Compose layers over the base file as
`docker-compose.override.yml`.

## What you need first

The three starter repositories must be checked out **as siblings of this one**:

```
your-workspace/
├── example-config/            ← this repo
├── indiekit-eleventy-starter/
├── indiekit-hugo-starter/
└── indiekit-jekyll-starter/
```

The paths are relative (`../indiekit-hugo-starter`), so the directory names matter.
Clone them from `getindiekit/{eleventy,hugo,jekyll}-starter`.

Then:

```sh
cp .env.example .env
```

and fill in `SECRET`, `MONGO_INITDB_ROOT_PASSWORD`, and — importantly — `HOST_UID`
and `HOST_GID` (`id -u` / `id -g`). See "Containers run as you" below for why those
two matter more than they look.

Start the stack, visit `http://localhost:3000/auth/new-password`, set a password,
paste the generated value into `PASSWORD_SECRET`, and restart.

## How each mode is wired

Every starter gets the same three-part shape:

| | Indiekit store | generator | web server |
| :--- | :--- | :--- | :--- |
| eleventy | `content/` | `@11ty/eleventy --watch` | `http-server _site` |
| hugo | repo root (`content/` + `static/`) | `hugo --watch` | `http-server public` |
| jekyll | repo root, `_`-prefixed collections | `jekyll build --watch` | `http-server _site` |

Indiekit is always on **:3000**, the site on **:8080**, MongoDB on **:27018**.

### Why a watcher plus a static server, and never a dev server

Each generator ships a dev server — `eleventy --serve`, `hugo server`,
`jekyll serve` — and all three are the wrong thing to test against:

- **They do not prune deletes.** Delete a post and the dev server keeps serving it,
  so the starters' `deleted post returns 404` assertion passes or fails for reasons
  that have nothing to do with the code. Hugo's `--renderToMemory` hid this so
  thoroughly that a real bug in `hugo-starter` went undiagnosed: locally the delete
  assertion passed, in CI it failed, and the difference was the dev server.
- **WEBrick resolves extension-less paths.** `jekyll serve` answers `/notes/x`
  whether Jekyll wrote `notes/x/index.html` or a flat `notes/x.html` — masking the
  single most important requirement in the Jekyll starter (every collection needs
  both `output: true` **and** a trailing-slash `permalink`).

So each mode builds to disk and serves the built output with the same `http-server`
the starters' own `npm run serve` and CI use. **The dev stack shows you what CI sees.**

One honest caveat: `http-server` is not strict either. Its `.html` fallback is on by
default and cannot be turned off (`--ext ''` is a no-op; `--ext false` is parsed as a
positional argument and silently changes the served root). No HTTP assertion can
distinguish `notes/x/index.html` from a flat `notes/x.html`. That is why
`jekyll-starter`'s `test/all-types.mjs` checks the built files **on disk** instead.

## Each starter gets its own database

The MongoDB volume is shared, so `starters/*.yml` overrides `MONGO_URL` per starter:
`indiekit_eleventy`, `indiekit_hugo`, `indiekit_jekyll`. Without this the admin
interface lists posts belonging to whichever starter ran last — their files live in a
different repository, so every link is broken.

The older shared `indiekit` database may still hold mixed posts from before this split
and can be dropped.

## Running a starter's test suite against this stack

The starters' tests shell out to their generator (`hugo`, `bundle exec jekyll`), which
you may not have installed. Running them inside a container that does avoids installing
Ruby or Hugo on your machine:

```sh
# from the starter repo, with the stack already up
docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e SECRET="<your SECRET>" \
  -e INDIEKIT_URL=http://localhost:3000 \
  -e PUBLICATION_URL=http://localhost:8080 \
  -v "$PWD:/site" -w /site \
  node:24-bookworm-slim sh -c "npm run smoke"     # eleventy
```

`--network host` is what makes `localhost:3000` and `localhost:8080` inside the
container mean the ports the stack publishes.

Use `hugomods/hugo:latest` for the Hugo starter — it already carries Node. Jekyll needs
both Ruby and Node in one image, plus `GEM_HOME`, `BUNDLE_PATH` and a warm gem volume.

Add `-e MONGO_URL="mongodb://<user>:<pass>@localhost:27018/indiekit_<starter>?authSource=admin"`
to exercise the delete assertion. Without it the smoke test skips it and reports
`5/5 assertions passed, 1 skipped`, which is expected rather than a failure
([indiekit#904](https://github.com/getindiekit/indiekit/issues/904)).

**Stop the watcher first** — `docker compose stop site` — or it races the test's own
build over the output directory. Restart it afterwards with `docker compose start site`.

## Gotchas worth knowing

**Open Indiekit on `localhost`, never `127.0.0.1`.** Indiekit latches
`application.url` from the very first request it receives and emits every absolute URL
from it, asset tags included. Hit `127.0.0.1:3000` once and the admin interface loads
unstyled for anyone using `localhost`, because the assets come from a different origin
([indiekit#906](https://github.com/getindiekit/indiekit/issues/906)). A readiness probe
counts as that first request, so probe the hostname a browser will use.

**Containers run as you.** `HOST_UID`/`HOST_GID` exist so posts and uploads written
into the bind-mounted starter repositories stay editable. Leave them unset and Compose
resolves `user:` to `":"` — which does not error, it silently means **root**.

**Docker creates missing mount points as root.** A bind-mounted directory that does not
exist yet, and an anonymous volume's mount point, are both created root-owned. That is
why `use-starter` pre-creates the store directories and the Jekyll `node_modules` mount
point, and chowns the `jekyll-gems` volume before the containers start. Symptom when it
goes wrong: `EACCES: permission denied, mkdir …` from `npm install` or `gem install`.

**Never kill by process name.** If your Docker daemon runs as your own user rather than
as root, container processes show up in the host process list — so `pkill -f eleventy`
reaches inside your running containers and kills them. Kill by port, by a PID you
captured, or with `docker compose stop`.

**Do not delete a directory while it is bind-mounted.** The container's mount then
points at a dead inode and writes hang; `docker compose exec` refuses with "current
working directory is outside of container mount namespace". Bring the stack down first.

## Relationship to upstream

This branch is a fork-only addition for now. It stays close to upstream so it is easy to rebase, and
could be offered upstream later as a self-contained feature:
the files under `starters/`, the `use-starter` script, this document, and the
`.env.example` keys the testbed needs.
