import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { coolifyService } from './coolify.service.js';

export async function coolifyRoutes(fastify: FastifyInstance) {
  // Obtener configuración de conexión Coolify
  fastify.get('/api/v1/coolify/config', async (_req: FastifyRequest) => {
    return coolifyService.getConfig();
  });

  // Guardar configuración de Coolify (URL y Token)
  fastify.post('/api/v1/coolify/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, token } = request.body as { url: string; token: string };
    if (!url) {
      return reply.code(400).send({ error: 'La URL de Coolify es obligatoria' });
    }
    const updated = await coolifyService.saveConfig(url, token);
    return { success: true, config: updated };
  });

  // Listar todas las aplicaciones desde Coolify
  fastify.get('/api/v1/coolify/apps', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const apps = await coolifyService.listApplications();
      return { success: true, count: apps.length, apps };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Error al listar aplicaciones de Coolify' });
    }
  });

  // Proteger una aplicación de Coolify con 1 solo clic
  fastify.post('/api/v1/coolify/protect', async (request: FastifyRequest, reply: FastifyReply) => {
    const { uuid, appName } = request.body as { uuid: string; appName?: string };
    if (!uuid) {
      return reply.code(400).send({ error: 'El UUID de la aplicación en Coolify es obligatorio' });
    }

    try {
      const result = await coolifyService.protectApplication(uuid, appName);
      return result;
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Error al proteger la aplicación en Coolify' });
    }
  });

  // Desproteger una aplicación de Coolify
  fastify.post('/api/v1/coolify/unprotect', async (request: FastifyRequest, reply: FastifyReply) => {
    const { uuid } = request.body as { uuid: string };
    if (!uuid) {
      return reply.code(400).send({ error: 'El UUID de la aplicación en Coolify es obligatorio' });
    }

    try {
      const result = await coolifyService.unprotectApplication(uuid);
      return result;
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Error al desproteger la aplicación' });
    }
  });
}
