#!/bin/bash

# Railway deployment script for Medusa v2
# Ensures proper binding to 0.0.0.0 and dynamic PORT

export PORT=${PORT:-8080}
export HOST=0.0.0.0
export MEDUSA_HOST=0.0.0.0
export MEDUSA_PORT=$PORT

echo "Starting Medusa with:"
echo "PORT: $PORT"
echo "HOST: $HOST"
echo "MEDUSA_HOST: $MEDUSA_HOST"
echo "MEDUSA_PORT: $MEDUSA_PORT"

# Build and start Medusa
yarn build
yarn start
