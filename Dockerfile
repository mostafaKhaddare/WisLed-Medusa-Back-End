FROM public.ecr.aws/docker/library/node:20.20.0-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN corepack enable

# --- STAGE 1: INSTALL ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./

# Run install in a CLEAN environment (No secrets here)
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- STAGE 2: BUILD ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ONLY use the secret for the build command
RUN --mount=type=secret,id=ENV_FILE,target=/tmp/.env \
    (set -a && . /tmp/.env && pnpm medusa build)

# --- STAGE 3: RUNTIME ---
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/.medusa/server
COPY --from=build /app/.medusa/server ./
EXPOSE 9000
CMD ["pnpm", "start"]
