#!/bin/sh
set -e

# Apply any pending migrations before the app boots. `migrate deploy` is the
# production-safe command: it only runs existing migrations, never generates new
# ones and never prompts.
echo "Running database migrations..."
npx prisma migrate deploy

# Hand off to the container's CMD (node dist/server.js).
exec "$@"
