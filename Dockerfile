# syntax=docker/dockerfile:1

# --- base: debian-slim has the OpenSSL that Prisma's engines need -----------
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# --- build: install all deps, generate client, compile TS -------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime ----------------------------------------------------------------
# We copy node_modules from the build stage as-is: it already contains both the
# generated Prisma client AND the Prisma CLI, which the entrypoint needs to run
# `prisma migrate deploy` on startup.
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
