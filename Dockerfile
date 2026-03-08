FROM node:20-alpine AS build
WORKDIR /build

# Install dependencies (reproducible)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build Medusa (generates .medusa folder)
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS final
WORKDIR /final

# Copy built artifacts
COPY --from=build /build/.medusa ./
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/package-lock.json ./package-lock.json

EXPOSE 9000

CMD ["npm", "run", "start"]
