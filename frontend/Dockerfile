# syntax=docker/dockerfile:1
# Build context is ./frontend (set in the workflow / compose).

# --- build: compile the Nuxt app to the node-server output ------------------
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . ./
RUN npm run build

# --- runtime: only the .output bundle is needed -----------------------------
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Nuxt's node server reads HOST/PORT from the environment.
ENV HOST=0.0.0.0
ENV PORT=3001
COPY --from=build /app/.output ./.output

EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]
