# ============================================================
# WisLed Medusa v2 Backend — Production Dockerfile
# Uses npm (not Yarn) to avoid yarn.lock immutability issues.
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

# Copy package manifests first (for Docker layer caching)
COPY package.json package-lock.json ./

# Install all dependencies (including devDeps needed for build)
RUN npm install

# Copy the rest of the source code
COPY . .

# Build Medusa (outputs to .medusa/server)
RUN npm run build

# ── Production runtime ─────────────────────────────────────
# Medusa's build output lives in .medusa/server.
# We install only production deps there, then run migrations + start.

WORKDIR /app/medusa/.medusa/server

# Install production dependencies inside the build output directory
RUN npm install --production

# Expose the default Medusa port (Railway overrides via $PORT env var)
EXPOSE 9000

# Run DB migrations then start the server
CMD ["sh", "-c", "npx medusa db:migrate && npx medusa start"]
