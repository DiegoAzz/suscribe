import { FastifyInstance, FastifyRequest } from 'fastify';

export async function traefikHelperRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/traefik/labels-generator', async (request: FastifyRequest) => {
    const {
      serviceName = 'mi-aplicacion',
      domain = 'app.appzplay.online',
      gatewayUrl = 'https://suscribe.appzplay.online',
    } = request.query as {
      serviceName?: string;
      domain?: string;
      gatewayUrl?: string;
    };

    const cleanHost = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();

    // 1. Formato Plano para la caja de texto de Coolify UI (Container Labels)
    const coolifyUiSnippet = `
# --- Pegar al final de la caja Active labels en Coolify ---
traefik.http.middlewares.appzplay-auth.forwardauth.address=${gatewayUrl}/api/v1/forward-auth/verify
traefik.http.middlewares.appzplay-auth.forwardauth.trustForwardHeader=true
traefik.http.middlewares.appzplay-auth.forwardauth.authResponseHeaders=X-License-Status,X-License-Tenant,X-License-App,X-License-Warning
`.trim();

    // 2. Formato YAML para Docker Compose
    const dockerComposeLabels = `
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.${serviceName}.rule=Host(\`${cleanHost}\`)"
  - "traefik.http.routers.${serviceName}.entrypoints=websecure"
  - "traefik.http.routers.${serviceName}.tls=true"
  - "traefik.http.routers.${serviceName}.tls.certresolver=letsencrypt"
  - "traefik.http.routers.${serviceName}.middlewares=appzplay-auth@docker"
  - "traefik.http.middlewares.appzplay-auth.forwardauth.address=${gatewayUrl}/api/v1/forward-auth/verify"
  - "traefik.http.middlewares.appzplay-auth.forwardauth.trustForwardHeader=true"
  - "traefik.http.middlewares.appzplay-auth.forwardauth.authResponseHeaders=X-License-Status,X-License-Tenant,X-License-App,X-License-Warning"
`.trim();

    return {
      serviceName,
      domain: cleanHost,
      gatewayUrl,
      coolifyUiSnippet,
      snippet: dockerComposeLabels,
      instructions: [
        '1. En la caja de Active labels de Coolify, busca la línea que dice .middlewares=gzip y agrégale ,appzplay-auth al final.',
        '2. Pega las 3 líneas del formato Coolify UI al final de la caja.',
        '3. Guarda cambios y presiona Deploy.',
      ],
    };
  });
}
