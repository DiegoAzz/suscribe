import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { forwardAuthService } from './forward-auth.service.js';

export async function forwardAuthRoutes(fastify: FastifyInstance) {
  // Endpoint de comprobación de salud para Docker / Traefik / Coolify
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'appzplay-license-gateway', timestamp: new Date().toISOString() };
  });

  fastify.get('/health/live', async () => ({ status: 'alive' }));
  fastify.get('/health/ready', async () => ({ status: 'ready' }));

  // Endpoint principal invocado por Traefik ForwardAuth
  const handleVerify = async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Extraer el dominio del cliente que se está evaluando.
    // Damos máxima prioridad a ?domain= si viene explícito en la URL del middleware,
    // luego a las cabeceras personalizadas y a X-Forwarded-Host enviadas por Traefik.
    const queryDomain = (request.query as { domain?: string })?.domain;
    const headerDomain =
      (request.headers['x-license-domain'] as string) ||
      (request.headers['x-app-domain'] as string) ||
      (request.headers['x-forwarded-host'] as string);

    let rawHost = queryDomain || headerDomain || (request.headers['host'] as string);
    if (rawHost && rawHost.includes(',')) {
      rawHost = rawHost.split(',')[0].trim();
    }
    const host = rawHost;

    const uri =
      (request.headers['x-forwarded-uri'] as string) ||
      (request.headers['x-original-url'] as string) ||
      '/';

    const method =
      (request.headers['x-forwarded-method'] as string) ||
      request.method ||
      'GET';

    const clientIp =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.ip;

    const userAgent = (request.headers['user-agent'] as string) || '';
    const acceptHeader = (request.headers['accept'] as string) || '';

    const result = await forwardAuthService.verifyRequest({
      host,
      uri,
      method,
      clientIp,
      userAgent,
      acceptHeader,
    });

    // Asignar cabeceras de respuesta si están definidas
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        reply.header(key, value);
      }
    }

    // Caso 1: Autorizado (200 OK)
    if (result.allowed) {
      return reply.code(200).send('OK');
    }

    // Caso 2: Redirección HTML (302 Found)
    if (result.redirectUrl) {
      return reply
        .code(302)
        .header('Location', result.redirectUrl)
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .type('text/plain')
        .send(`Redirecting to ${result.redirectUrl}`);
    }

    // Caso 3: Denegado / Forbidden (403 / 503)
    return reply.code(result.statusCode).send(result.jsonBody);
  };

  fastify.get('/api/v1/forward-auth/verify', handleVerify);
  fastify.head('/api/v1/forward-auth/verify', handleVerify);

  // Alias para compatibilidad con configuraciones de Traefik directas
  fastify.get('/verify', handleVerify);
  fastify.head('/verify', handleVerify);
}
