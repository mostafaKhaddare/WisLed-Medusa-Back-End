## Medusa v2 (2.12.x) - Medusa Cloud compatible container build
## - Uses pnpm via Corepack
## - Runs `pnpm medusa build` to generate `.medusa/server`
## - Final image contains only compiled server output + production deps

FROM public.ecr.aws/docker/library/node:20.20.0-slim AS base

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable

# ---------------------------
# deps (install)
# ---------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml ./

# Cache pnpm store between builds (supported by BuildKit)
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile=false

# ---------------------------
# build (medusa build)
# ---------------------------
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/package.json ./package.json

COPY . .

# Build output must be `.medusa/server` for Medusa Cloud
RUN pnpm medusa build

# ---------------------------
# runtime (minimal)
# ---------------------------
FROM base AS runtime

ENV NODE_ENV=production

# App root (contains node_modules from build)
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules

# Use the generated `.medusa/server` project as the runtime app
WORKDIR /app/.medusa/server
COPY --from=build /app/.medusa/server ./

EXPOSE 9000

# Use the standard Medusa start script from the generated app
CMD ["pnpm", "start"]

