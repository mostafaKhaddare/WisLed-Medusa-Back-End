# ---------------------------
# 1. Install Stage (CLEAN ENVIRONMENT)
# ---------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml ./

# DO NOT source the .env here. 
# This ensures the lockfile matches your local machine perfectly.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ---------------------------
# 2. Build Stage (WITH SECRETS)
# ---------------------------
FROM base AS build

# Copy the node_modules we just installed
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy your source code
COPY . .

# NOW we bring in the secrets, but ONLY for the build command
# Medusa needs the .env variables here to compile the admin/server
RUN --mount=type=secret,id=ENV_FILE,target=/tmp/.env \
    (set -a && . /tmp/.env && pnpm medusa build)
