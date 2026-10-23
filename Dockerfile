# ========================================================
# Dockerfile Multi-Stage para AppzPlay License Gateway
# Optimizado para Coolify y Entornos de Producción
# ========================================================

# --- Etapa 1: Construcción (Builder) ---
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias de compilación
RUN apk add --no-cache openssl python3 make g++

# Variable dummy para compilación de esquemas Prisma
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

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
ENV DATABASE_URL="postgresql://appzplay_user:appzplay_secure_password_2026@postgres:5432/appzplay_license_db?schema=public"

RUN apk add --no-cache openssl curl bash

# Crear usuario seguro sin privilegios
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appzplay

# Copiar manifiestos
COPY package*.json ./
COPY prisma ./prisma/
COPY docker-entrypoint.sh ./

RUN chmod +x docker-entrypoint.sh

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

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
