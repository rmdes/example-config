# Adjust NODE_VERSION as desired. Indiekit requires Node.js v24.17 or later.
# Floating on the major version keeps security updates flowing without pinning
# to a release that will eventually be too old to run Indiekit.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine

# Create app directory
WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Run as the unprivileged `node` user provided by the base image rather than as
# root. As well as being good practice, files written to a mounted content store
# are then not owned by root, so you can still edit your own posts.
RUN chown node:node /usr/src/app
USER node

# Install node modules
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY --chown=node:node . .

# Expose port
EXPOSE 3000

# Start the server by default, this can be overwritten at runtime
CMD [ "npx", "indiekit", "serve" ]
