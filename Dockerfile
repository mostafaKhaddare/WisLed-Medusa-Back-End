FROM public.ecr.aws/docker/library/node:20.20.0-slim AS base

# Move this DOWN so it doesn't affect the install phase
# ENV NODE_ENV=production 
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app
RUN corepack enable

# ---------------------------
# deps (install)
# ---------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml ./

# 1. We don't set NODE_ENV=production here so we get ALL dependencies
# 2. Re-enabled --frozen-lockfile for security
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ---------------------------
# build (medusa build)
# ---------------------------
FROM base AS build

# Copy everything from deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

COPY . .

# Now we have the Medusa CLI and TypeScript needed to build
RUN pnpm medusa build

# ---------------------------
# runtime (minimal)
# ---------------------------
FROM base AS runtime

# NOW we set it to production for the final lean image
ENV NODE_ENV=production

WORKDIR /app

# Only copy the production-ready node_modules and built server
COPY --from=build /app/node_modules ./node_modules

WORKDIR /app/.medusa/server
COPY --from=build /app/.medusa/server ./

EXPOSE 9000

CMD ["pnpm", "start"]
