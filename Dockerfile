FROM node:20-alpine

WORKDIR /app/medusa

# Install build dependencies
RUN apk add --no-cache python3 py3-pip make g++

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy rest of source
COPY . .

# Build the Medusa project
RUN npm run build

EXPOSE 9000

CMD ["sh", "-c", "npm run db:migrate && npm run start"]