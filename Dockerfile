## Medusa v2 (2.12.x) production image for Render Web Service
FROM node:20-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.28.2 --activate

# ---------------------------
# deps
# ---------------------------
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile=false

# ---------------------------
# build
# ---------------------------
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG MEDUSA_BACKEND_URL
ENV MEDUSA_BACKEND_URL=$MEDUSA_BACKEND_URL
ENV NODE_ENV=production

RUN pnpm run build

# ---------------------------
# runtime
# ---------------------------
FROM base AS runtime

ENV NODE_ENV=production

WORKDIR /app/.medusa/server
COPY --from=build /app/.medusa/server ./

RUN printf "dangerouslyAllowAllBuilds=true\n" >> .npmrc \
  && pnpm install --prod --frozen-lockfile=false

CMD ["pnpm", "start"]
