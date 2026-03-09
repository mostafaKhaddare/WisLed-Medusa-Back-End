## Medusa v2 (2.12.x) - Optimized for pnpm v10
FROM public.ecr.aws/docker/library/node:20.20.0-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

# Enable corepack to use the pnpm version specified in your package.json
RUN corepack enable

# ---------------------------
# 1. DEPS (Install phase)
# ---------------------------
FROM base AS deps

# Copy only files needed for install
COPY package.json pnpm-lock.yaml ./

# We use --no-frozen-lockfile to bypass the Checksum Mismatch error
# and avoid sourcing the .env file here to keep the environment clean.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --no-frozen-lockfile

# ---------------------------
# 2. BUILD (Medusa build phase)
# ---------------------------
FROM base AS build

# Bring in the modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# We use the secret mount ONLY here. 
# Medusa needs your secrets to compile the Admin dashboard.
RUN --mount=type=secret,id=ENV_FILE,target=/tmp/.env \
    (set -a && . /tmp/.env && pnpm run build)

# ---------------------------
# 3. RUNTIME (Production phase)
# ---------------------------
FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app

# Copy production node_modules
COPY --from=build /app/node_modules ./node_modules

# Move into the generated server directory
WORKDIR /app/.medusa/server
COPY --from=build /app/.medusa/server ./

EXPOSE 9000

# Start the Medusa server
CMD ["pnpm", "start"]
