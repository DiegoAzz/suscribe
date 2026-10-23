import { FastifyInstance, FastifyRequest } from 'fastify';

export async function traefikHelperRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/traefik/labels-generator', async (request: FastifyRequest) => {
    const {
      serviceName = 'mi-aplicacion',
      domain = 'app.appzplay.online',
      gatewayUrl = 'http://appzplay-gateway:3000',
    } = request.query as {
      serviceName?: string;
      domain?: string;
      gatewayUrl?: string;
    };

    const dockerComposeLabels = `
# ========================================================
# Etiquetas Traefik ForwardAuth para Coolify / Docker
# Aplicación: ${serviceName} | Dominio: ${domain}
# ========================================================
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.${serviceName}.rule=Host(\`${domain}\`)"
  - "traefik.http.routers.${serviceName}.entrypoints=websecure"
  - "traefik.http.routers.${serviceName}.tls=true"
  - "traefik.http.routers.${serviceName}.tls.certresolver=letsencrypt"

  # Middleware de Enlace hacia AppzPlay License Gateway
  - "traefik.http.routers.${serviceName}.middlewares=${serviceName}-forwardauth@docker"
  - "traefik.http.middlewares.${serviceName}-forwardauth.forwardauth.address=${gatewayUrl}/api/v1/forward-auth/verify"
  - "traefik.http.middlewares.${serviceName}-forwardauth.forwardauth.trustForwardHeader=true"
  - "traefik.http.middlewares.${serviceName}-forwardauth.forwardauth.authResponseHeaders=X-License-Status,X-License-Tenant,X-License-App,X-License-Warning"
`.trim();

    return {
      serviceName,
      domain,
      gatewayUrl,
      snippet: dockerComposeLabels,
      instructions: [
        '1. Abre la aplicación deseada en Coolify.',
        '2. En la sección "Docker Compose" o "Custom Traefik Labels", pega las etiquetas generadas.',
        '3. Asegúrate de que la aplicación y el contenedor de la pasarela compartan la red "coolify" o utilicen el dominio público de suscribe.',
        '4. Realiza el despliegue en Coolify sin necesidad de reiniciar Traefik globalmente.',
      ],
    };
  });
}
