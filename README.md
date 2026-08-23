# Example configuration for Indiekit

This example configuration can be used as a starting point for configuring your own Indiekit server.

This example assumes that you want to:

* host your content on GitHub
* publish your website using Jekyll
* syndicate content to a Mastodon server

## Requirements

* [Node.js](https://nodejs.org) v24.17 or later

## Configuration variables

Copy `.env.example` to `.env` and replace the values with your own:

`cp .env.example .env`

The following variables are read by the [configuration file](indiekit.config.js):

* `PUBLICATION_URL`
* `GITHUB_USER`
* `GITHUB_REPO`
* `GITHUB_BRANCH`
* `MASTODON_URL`
* `MASTODON_USER`

Some values shouldn’t be made public, or included in your configuration file. Instead, they should be saved as environment variables that can only be seen by you and your server:

* `GITHUB_TOKEN`
* `MASTODON_ACCESS_TOKEN`
* `MONGO_URL`
* `PASSWORD_SECRET`
* `SECRET`

### Generating `PASSWORD_SECRET`

`PASSWORD_SECRET` can only be generated once your server is running, so leave it blank to begin with:

1. ensure `SECRET` is set, then start the server
2. visit `/auth/new-password`
3. enter the password you want to use and click ‘Generate password secret’
4. copy the value shown, save it as `PASSWORD_SECRET`, and restart the server

## Starting your server

Once you have updated `.env` with your own values, install dependencies and start the server:

```sh
npm install
npm start
```

Your server will be available at `http://localhost:3000`.

> [!NOTE]
> A [MongoDB](https://www.mongodb.com) database is optional. Without one, you can still publish posts, but viewing, editing, deleting and restoring previously published posts, syndicating posts, and managing uploaded media files will be unavailable.

## Server deployment using Docker

If you want to deploy your server using [Docker](https://www.docker.com), the following files are provided as a starting point:

* `.dockerignore`
* `docker-compose.yml`
* `Dockerfile`

If you are using Docker Compose, the `MONGO_URL` environment variable does not need to be set. The following environment variables should be provided instead:

* `MONGO_INITDB_ROOT_USERNAME`
* `MONGO_INITDB_ROOT_PASSWORD`

To start both the server and its database:

```sh
docker compose up --build
```

## Server deployment using Railway

Click the button to use this configuration as the basis of a new service deployed with Railway:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/gEboK6?referralCode=bCd1gL)

## Smoke test

A single test checks that this configuration still works: it publishes a note
through the Micropub API, verifies the file the content store received, and
deletes it again.

The GitHub content store is pointed at a local stub (`test/github-stub.mjs`)
through its `baseUrl` option, so the test needs no access token, makes no
network request, and writes to no repository — while still exercising the
plug-ins, preset, publication and syndicator options configured here.

It runs on every push and weekly, so a change in a published `@indiekit/*`
package is caught here rather than by the next person to clone this repository.

The test starts and stops its own server, and refuses to run if the ports it
needs are already in use, so it cannot publish into a server it did not start.
All it needs is a MongoDB — deleting a post requires one — and the `.env`
described above:

```sh
npm install
npm run smoke
```
