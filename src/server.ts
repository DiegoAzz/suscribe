import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { forwardAuthRoutes } from './modules/forward-auth/forward-auth.controller.js';
import { authRoutes } from './modules/auth/auth.controller.js';
import { applicationsRoutes } from './modules/applications/applications.controller.js';
import { tenantsRoutes } from './modules/tenants/tenants.controller.js';
import { domainsRoutes } from './modules/domains/domains.controller.js';
import { licensesRoutes } from './modules/licenses/licenses.controller.js';
import { bypassRulesRoutes } from './modules/bypass-rules/bypass-rules.controller.js';
import { auditRoutes } from './modules/audit/audit.controller.js';
import { traefikHelperRoutes } from './modules/traefik-helper/traefik-helper.controller.js';
import { coolifyRoutes } from './modules/coolify/coolify.controller.js';
import { renderSuspendedPage } from './views/suspended.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = fastify({
    logger: env.NODE_ENV === 'development' ? { level: 'info' } : { level: 'warn' },
    trustProxy: true,
  });

  // Permitir bodies vacíos en peticiones POST/PUT/PATCH con Content-Type: application/json
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const str = (body as string || '').trim();
      const json = str ? JSON.parse(str) : {};
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  // 1. CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // 2. Helmet para Seguridad HTTP
  await app.register(helmet, {
    contentSecurityPolicy: false, // Permitir React SPA y estilos inline de la vista de suspensión
  });

  // 3. Cookies y JWT
  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // 4. Registrar Rutas de la API y ForwardAuth
  await app.register(forwardAuthRoutes);
  await app.register(authRoutes);
  await app.register(applicationsRoutes);
  await app.register(tenantsRoutes);
  await app.register(domainsRoutes);
  await app.register(licensesRoutes);
  await app.register(bypassRulesRoutes);
  await app.register(auditRoutes);
  await app.register(traefikHelperRoutes);
  await app.register(coolifyRoutes);

  // 5. Vista Pública de Suspensión (/suspended)
  app.get('/suspended', async (request, reply) => {
    const query = request.query as { domain?: string; reason?: string; uri?: string };
    const html = renderSuspendedPage({
      domain: query.domain,
      reason: query.reason,
      uri: query.uri,
    });
    return reply.type('text/html').send(html);
  });

  // 6. Servir Frontend SPA (React + Vite) si la carpeta client/dist existe
  const clientDistPath = path.resolve(__dirname, '../client/dist');
  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
    });

    // Fallback para React Router (SPA)
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url && request.raw.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'Endpoint no encontrado' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

async function normalizeLegacyDomains() {
  try {
    const all = await prisma.domain.findMany();
    for (const d of all) {
      const clean = d.hostname.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
      if (clean !== d.hostname) {
        const exists = await prisma.domain.findUnique({ where: { hostname: clean } });
        if (!exists) {
          await prisma.domain.update({ where: { id: d.id }, data: { hostname: clean } });
          console.log(`[Auto-Clean] Dominio normalizado: '${d.hostname}' -> '${clean}'`);
        } else {
          await prisma.domain.delete({ where: { id: d.id } });
        }
      }
    }
  } catch (err) {
    console.error('[Auto-Clean] Error normalizando dominios:', err);
  }
}

async function startServer() {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 AppzPlay License Gateway escuchando en http://${env.HOST}:${env.PORT}`);
    console.log(`🛡️  ForwardAuth Endpoint: http://${env.HOST}:${env.PORT}/api/v1/forward-auth/verify`);
    console.log(`📊 Panel Administrativo: http://${env.HOST}:${env.PORT}/`);
    // Limpiar dominios con https:// de forma asíncrona
    normalizeLegacyDomains();
  } catch (err) {
    console.error('Error fatal al iniciar AppzPlay License Gateway:', err);
    process.exit(1);
  }
}

// Iniciar servidor solo si es ejecutado directamente
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

// Manejo de señales de terminación segura (para Docker y Coolify)
process.on('SIGTERM', async () => {
  console.log('Recibida señal SIGTERM. Cerrando conexiones seguras...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Recibida señal SIGINT. Cerrando conexiones...');
  await prisma.$disconnect();
  process.exit(0);
});
