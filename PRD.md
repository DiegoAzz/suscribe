# PRD — AppzPlay License Gateway
*Sistema Centralizado de Control de Acceso, Licenciamiento y Bloqueo Perimetral No Destructivo para Aplicaciones SaaS con Traefik ForwardAuth.*

## 1. Resumen Ejecutivo
AppzPlay License Gateway es la plataforma responsable de auditar, controlar y gobernar el acceso HTTP a todas las aplicaciones SaaS alojadas en el ecosistema Coolify del VPS. Opera interceptando peticiones en tiempo real mediante el middleware Traefik ForwardAuth y validando el estado comercial de la suscripción (Activa, En Gracia, Suspendida, Vencida, Cancelada).

## 2. Requerimientos Funcionales
1. **Verificación ForwardAuth de Alta Velocidad:**
   - Endpoint `/api/v1/forward-auth/verify` invocado por Traefik en cada petición.
   - Extracción de cabeceras estándar: `X-Forwarded-Host`, `X-Forwarded-Uri`, `X-Forwarded-Method`.
   - Consulta ultra rápida con caché en memoria (LRU) invalidable al instante.
   - Devolución de `200 OK` para licencias válidas, o `302 Found` / `403 Forbidden` para licencias suspendidas/vencidas.
2. **Página de Suspensión Personalizada:**
   - Vista pública responsive accesible en `/suspended?domain=...` con datos del cliente, estado comercial, motivo y botón de contacto/pago.
3. **Reglas de Bypass:**
   - Rutas exceptuadas de validación de licencia por aplicación (ej. `/api/webhooks/*`, `/.well-known/*`, `/health*`).
4. **Gestión Administrativa Completa:**
   - Gestión de Clientes / Tenants (crear, editar, listar).
   - Gestión de Aplicaciones (TurnoYa, ComidaYa, NewsFlow AI, Dummy App, etc.).
   - Asignación de Dominios personalizados y subdominios.
   - Acciones de Licencia con 1 Clic: Suspender acceso de inmediato, Reactivar, Modificar fecha de vencimiento, Extender período de gracia.
   - Auditoría en vivo: Registro de peticiones interceptadas, host, path, latencia y veredicto.
5. **Preservación No Destructiva de Datos:**
   - La suspensión nunca detiene los contenedores del cliente ni borra sus bases de datos. El corte ocurre en la capa de enrutamiento HTTP de Traefik.
6. **Seguridad y Producción en Coolify:**
   - Base de datos PostgreSQL con migraciones versionadas (Prisma).
   - Docker Compose multi-contenedor optimizado para Coolify con persistencia en volúmenes.
   - App Dummy incluida para validación de pruebas unitarias y de integración del proxy.
