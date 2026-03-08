FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies using npm ci for reproducible install
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source files
COPY . .

# Build Medusa (generates .medusa folder)
RUN npm run build

# ---------- Runtime image ----------
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy only the built .medusa folder and production dependencies
COPY --from=builder /app/.medusa ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./

# Expose Medusa default port (9000)
EXPOSE 9000

# Start Medusa server
CMD ["npm", "run", "start"]
