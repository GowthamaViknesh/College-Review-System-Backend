# --- Build: compile TypeScript with the full set of dependencies ---
FROM node:22-alpine AS build
WORKDIR /app

# The test library would download a 100 MB MongoDB binary here; the build does not need it
ENV MONGOMS_DISABLE_POSTINSTALL=1

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Run: only the compiled code and the packages it needs at runtime ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Do not run the server as root
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
