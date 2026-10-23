# 🛡️ AppzPlay License Gateway (`suscribe.appzplay.online`)

Plataforma centralizada y no destructiva de licenciamiento, control de acceso y corte perimetral para aplicaciones SaaS alojadas en Coolify / VPS mediante el middleware **Traefik ForwardAuth**.

---

## 📌 1. Principios de Arquitectura y Seguridad

1. **Corte Perimetral No Destructivo:**
   El bloqueo por mora o vencimiento se realiza a nivel HTTP en el proxy inverso (Traefik). Las bases de datos, archivos y contenedores de los clientes permanecen **100% seguros e intactos**.
2. **Ultra Baja Latencia (<2ms):**
   Caché LRU en memoria con invalidación reactiva inmediata ante cualquier acción de suspensión o reactivación en el panel administrativo.
3. **Aislamiento Total del VPS:**
   No se modifican configuraciones globales de Traefik ni se tocan otras aplicaciones ajenas del VPS.
4. **Respaldo de Emergencia (Fail-Safe):**
   Si en algún momento el Gateway entrara en mantenimiento, Traefik o Coolify permiten desactivar temporalmente el middleware de la aplicación en 1 línea sin causar downtime.

---

## 🚀 2. Despliegue en Coolify Paso a Paso

1. **Crear Nuevo Proyecto / Servicio en Coolify:**
   - Tipo: **Docker Compose**
   - Nombre: `AppzPlay License Gateway`
   - Dominio asignado: `https://suscribe.appzplay.online`
2. **Repositorio Git:**
   - Conectar el repositorio: `https://github.com/DiegoAzz/suscribe.git`
   - Rama: `main`
3. **Variables de Entorno en Coolify:**
   ```env
   NODE_ENV=production
   APP_URL=https://suscribe.appzplay.online
   POSTGRES_USER=appzplay_user
   POSTGRES_PASSWORD=tu_password_segura_de_produccion_aqui
   POSTGRES_DB=appzplay_license_db
   JWT_SECRET=tu_jwt_secret_aleatorio_32_caracteres_o_mas
   COOKIE_SECRET=tu_cookie_secret_aleatorio_64_caracteres
   DEFAULT_ADMIN_EMAIL=admin@appzplay.online
   DEFAULT_ADMIN_PASSWORD=TuPasswordAdminSegura2026!
   ```
4. **Desplegar:**
   - Haz clic en **Deploy**. Coolify compilará la imagen Docker multi-etapa, levantará PostgreSQL con volumen persistente, aplicará las migraciones SQL de Prisma y ejecutará el seed inicial.

---

## 🔌 3. Cómo Proteger Cualquier Aplicación Existente (TurnoYa, ComidaYa, NewsFlow)

Para integrar una aplicación SaaS al Gateway, solo debes añadir estas etiquetas Traefik en el `docker-compose.yml` de la aplicación en Coolify:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.mi-app.rule=Host(`cliente.mitrabajo.online`)"
  - "traefik.http.routers.mi-app.entrypoints=websecure"
  - "traefik.http.routers.mi-app.tls=true"
  - "traefik.http.routers.mi-app.tls.certresolver=letsencrypt"

  # Middleware de ForwardAuth conectado al Gateway
  - "traefik.http.routers.mi-app.middlewares=appzplay-auth@docker"
  - "traefik.http.middlewares.appzplay-auth.forwardauth.address=http://gateway:3000/api/v1/forward-auth/verify"
  - "traefik.http.middlewares.appzplay-auth.forwardauth.trustForwardHeader=true"
  - "traefik.http.middlewares.appzplay-auth.forwardauth.authResponseHeaders=X-License-Status,X-License-Tenant,X-License-App,X-License-Warning"
```

---

## 🛠️ 4. Procedimiento de Recuperación y Contingencia

Si en caso de emergencia se requiere dar acceso inmediato a una aplicación sin pasar por el Gateway:
1. En Coolify, entra a la aplicación afectada.
2. Comenta temporalmente la línea:
   ```yaml
   # - "traefik.http.routers.mi-app.middlewares=appzplay-auth@docker"
   ```
3. Guarda y presiona **Redeploy**. El tráfico entrará directo a la app sin comprobación de ForwardAuth.

---

## 🧪 5. Ejecución de Pruebas Automatizadas

```bash
npm run test
```
Ejecuta la suite de 10 pruebas unitarias y de integración validando:
- Bypasses de certificados SSL y Webhooks
- Licencias activas (200 OK)
- Período de gracia (200 OK con warning)
- Bloqueo en navegador (302 Redirect a `/suspended`)
- Bloqueo en llamadas API (403 Forbidden JSON)
- Invalidación instantánea de caché LRU
- No-destrucción de datos del cliente
