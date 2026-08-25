# NexusMCP - Production Docker Image
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src

RUN npm install --ignore-scripts && npm run build

# Runner Image
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY nexus-mcp.config.example.json ./nexus-mcp.config.json

EXPOSE 8080

CMD ["node", "dist/cli.js", "--http", "--port", "8080", "--config", "./nexus-mcp.config.json"]
