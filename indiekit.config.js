import { existsSync } from "node:fs";
import process from "node:process";

// Node.js can read `.env` itself, so no dependency is needed. The file is
// optional: in production (and in the Docker image, where `.env` is excluded
// by `.dockerignore`) these values come from real environment variables.
if (existsSync(".env")) {
  process.loadEnvFile();
}

// Local testbed config, used by `./use-starter local`. Each SSG starter mounts
// its own indiekit.config.js over this one, so this only configures the
// ./eleventy scaffold in this repo.
const config = {
  plugins: ["@indiekit/preset-eleventy", "@indiekit/store-file-system"],

  publication: {
    me: process.env.PUBLICATION_URL,
  },

  "@indiekit/store-file-system": {
    directory: "./content",
  },
};

export default config;
