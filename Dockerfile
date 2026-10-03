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

# The lockfile is honoured deliberately. With --frozen-lockfile=false the image
# re-resolved every caret range at build time, so Render compiled whatever
# versions happened to be published that day and the build broke on a
# third-party type declaration rather than on anything in this repository.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc .pnpmfile.cjs ./
RUN pnpm install --frozen-lockfile

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

# This stage deliberately does not use --frozen-lockfile. `medusa build` writes a
# generated package.json into .medusa/server listing the 29 production
# dependencies, and it does not emit a lockfile alongside it. The repository's
# pnpm-lock.yaml does not match that generated manifest, so freezing here fails
# with ERR_PNPM_OUTDATED_LOCKFILE. The deps stage above is the one that pins.
RUN printf "dangerouslyAllowAllBuilds=true\n" >> .npmrc \
  && pnpm install --prod --frozen-lockfile=false

CMD ["pnpm", "start"]
