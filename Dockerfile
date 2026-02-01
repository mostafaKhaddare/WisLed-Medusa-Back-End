# Use Node 20 official image (includes Corepack)
FROM node:20-slim

# Set working directory
WORKDIR /app/medusa

# Install python (needed by some packages)
RUN apt-get update && apt-get install -y python3 python3-pip python-is-python3 && rm -rf /var/lib/apt/lists/*

# Copy only package files first (Docker caching)
COPY package.json package-lock.json yarn.lock ./

# Enable Corepack and install dependencies
RUN corepack enable \
    && corepack prepare yarn@3.2.3 --activate \
    && yarn install --immutable

# Copy rest of the code
COPY . .

# Build Medusa
RUN yarn build

# Expose default Medusa port
EXPOSE 9000

# Use a simple entrypoint script to run migrations then start
CMD ["sh", "-c", "yarn db:migrate && yarn start"]
