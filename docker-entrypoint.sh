#!/bin/sh
set -e

echo "=== Iniciando AppzPlay License Gateway ==="

# 1. Garantizar DATABASE_URL por defecto si no está definida en Coolify
if [ -z "$DATABASE_URL" ]; then
  POSTGRES_USER="${POSTGRES_USER:-appzplay_user}"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-appzplay_secure_password_2026}"
  POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
  POSTGRES_PORT="${POSTGRES_PORT:-5432}"
  POSTGRES_DB="${POSTGRES_DB:-appzplay_license_db}"

  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
  echo "[Config] DATABASE_URL generada automáticamente con host '$POSTGRES_HOST'."
fi

echo "[Config] Conectando a Base de Datos..."

# 2. Intentar aplicar migraciones y seed de forma segura (con reintentos)
MAX_RETRIES=10
RETRY_COUNT=0
MIGRATION_SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "[DB] Intento de conexión y migración ($RETRY_COUNT/$MAX_RETRIES)..."
  
  if npx prisma migrate deploy; then
    echo "✅ [DB] Migraciones aplicadas correctamente."
    MIGRATION_SUCCESS=true
    break
  else
    echo "⚠️ [DB] Base de datos no disponible aún. Esperando 3 segundos..."
    sleep 3
  fi
done

if [ "$MIGRATION_SUCCESS" = "true" ]; then
  echo "[DB] Ejecutando seed inicial si es necesario..."
  node -e "import('./dist/db/prisma.js').then(m => m.prisma.adminUser.count()).then(c => { if(c === 0) { console.log('Sin administradores, ejecutando seed...'); import('child_process').then(cp => cp.execSync('npx tsx prisma/seed.ts', {stdio: 'inherit'})); } else { console.log('Administradores existentes:', c); } }).catch(err => console.log('Seed skip:', err.message))" || true
else
  echo "⚠️ [ADVERTENCIA] No se pudo conectar a PostgreSQL tras varios intentos."
  echo "⚠️ El servidor iniciará para permitir comprobaciones de salud y configuración desde el panel."
fi

# 3. Iniciar el servidor Fastify
echo "🚀 Iniciando servidor HTTP en puerto ${PORT:-3000}..."
exec node dist/server.js
