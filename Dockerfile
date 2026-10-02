FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the rest and build the frontend
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

# Persistent data: Baileys sessions, JSON store, uploads, media
VOLUME ["/app/server-data"]

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
