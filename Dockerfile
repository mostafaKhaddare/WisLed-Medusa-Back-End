# Use Node 20 official slim image (has Corepack)
FROM node:20-slim

# Set working directory
WORKDIR /app/medusa

# Install python (needed for some Medusa deps)
RUN apt-get update && apt-get install -y python3 python3-pip python-is-python3 && rm -rf /var/lib/apt/lists/*

# Copy only package files first for caching
COPY package.json yarn.lock package-lock.json ./

# Enable Corepack and install Yarn dependencies
RUN corepack enable \
    && corepack prepare yarn@3.2.3 --activate \
    && yarn install --immutable

# Copy the rest of the code
COPY . .

# Build Medusa
RUN yarn build

# Expose Medusa default port
EXPOSE 9000

# Run migrations then start Medusa
CMD ["sh", "-c", "yarn db:migrate && yarn start"]
