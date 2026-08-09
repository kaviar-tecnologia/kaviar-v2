FROM node:24-slim AS builder

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=${GIT_COMMIT}

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl

COPY package*.json ./
COPY prisma ./prisma/
COPY docs ./docs/
COPY . .

# Limpar cache do Prisma e instalar dependências
RUN npm ci
RUN rm -rf node_modules/.prisma node_modules/@prisma/client

# Gerar Prisma Client para Debian (linux-gnu)
RUN npx prisma generate

RUN rm -rf dist
RUN npm run build

FROM node:24-slim

ARG GIT_COMMIT=unknown

WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

# Instalar apenas produção
RUN npm ci --only=production

# Limpar e regenerar Prisma Client no ambiente de produção
RUN rm -rf node_modules/.prisma node_modules/@prisma/client
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./data
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/docs ./docs
COPY healthcheck.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV GIT_COMMIT=${GIT_COMMIT}

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "dist/server.js"]
