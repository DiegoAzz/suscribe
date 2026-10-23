# ========================================================
# Dockerfile Multi-Stage para AppzPlay License Gateway
# Optimizado para Coolify y Entornos de Producción
# ========================================================

# --- Etapa 1: Construcción (Builder) ---
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias de compilación
RUN apk add --no-cache openssl python3 make g++

# Copiar manifiestos y esquemas
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm ci

# Generar cliente de Prisma
RUN npx prisma generate

# Copiar código fuente del servidor
COPY tsconfig.json ./
COPY src ./src/

# Construir servidor
RUN npm run build:server

# Construir cliente Frontend (React SPA)
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client ./client/
RUN cd client && npm run build

# --- Etapa 2: Imagen de Producción Mínima ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN apk add --no-cache openssl curl

# Crear usuario seguro sin privilegios
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appzplay

# Copiar manifiestos
COPY package*.json ./
COPY prisma ./prisma/

# Instalar solo dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Regenerar cliente Prisma para producción
RUN npx prisma generate

# Copiar compilados desde builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/dist ./client/dist

# Permisos
RUN chown -R appzplay:nodejs /app

USER appzplay

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
