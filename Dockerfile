# ============================================================
# WisLed Medusa v2 Backend — Production Dockerfile
# Configured correctly for Yarn Berry (v3+) with Corepack
# ============================================================

FROM node:20-slim

# Install system dependencies required by some Medusa packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app/medusa

# Prepare Corepack for Yarn Berry
RUN corepack enable

# Copy package manifests AND lockfile first (for Docker layer caching)
# We also copy .yarnrc.yml to ensure Yarn Berry config is respected
COPY package.json yarn.lock .yarnrc.yml ./

# Copy the .yarn folder which contains the Yarn Berry executable (yarn-4.13.0.cjs)
COPY .yarn ./.yarn

# Install all dependencies precisely matching yarn.lock
RUN yarn install --immutable

# Copy the rest of the source code
COPY . .

# Build Medusa (outputs to .medusa/server)
RUN yarn build

# ── Production runtime ─────────────────────────────────────
WORKDIR /app/medusa/.medusa/server

# In Medusa v2, the compiled server still needs its own dependencies.
# We copy the lockfile, config, and .yarn runtime into the build directory too.
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Install production dependencies inside the build output directory
RUN yarn workspaces focus --production || yarn install --immutable

# Expose the default Medusa port
EXPOSE 9000

# Run DB migrations then start the server
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
