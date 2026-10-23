import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { z } from 'zod';
import { licenseCache } from '../../cache/license-cache.js';

const appSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'El slug solo debe contener letras minúsculas, números y guiones'),
  name: z.string().min(2),
  description: z.string().optional(),
  defaultRedirectUrl: z.string().url().optional().or(z.literal('')),
  defaultGracePeriodDays: z.number().int().min(0).max(30).default(3),
  isActive: z.boolean().default(true),
});

export async function applicationsRoutes(fastify: FastifyInstance) {
  // Listar todas las aplicaciones con conteo de dominios y licencias
  fastify.get('/api/v1/applications', async () => {
    return prisma.application.findMany({
      include: {
        _count: {
          select: {
            domains: true,
            licenses: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Obtener una por ID o Slug
  fastify.get('/api/v1/applications/:idOrSlug', async (request: FastifyRequest, reply: FastifyReply) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        domains: { include: { tenant: true } },
        licenses: { include: { tenant: true } },
        bypassRules: true,
      },
    });

    if (!app) {
      return reply.code(404).send({ error: 'Aplicación no encontrada' });
    }
    return app;
  });

  // Crear aplicación
  fastify.post('/api/v1/applications', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = appSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const existing = await prisma.application.findUnique({
      where: { slug: parse.data.slug },
    });

    if (existing) {
      return reply.code(409).send({ error: `El slug '${parse.data.slug}' ya está registrado` });
    }

    const created = await prisma.application.create({
      data: parse.data,
    });

    return reply.code(201).send(created);
  });

  // Actualizar aplicación
  fastify.put('/api/v1/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parse = appSchema.partial().safeParse(request.body);

    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const updated = await prisma.application.update({
      where: { id },
      data: parse.data,
      include: { domains: true },
    });

    // Invalidar caché de todos los dominios de esta aplicación
    for (const d of updated.domains) {
      licenseCache.invalidate(d.hostname);
    }

    return updated;
  });

  // Eliminar aplicación
  fastify.delete('/api/v1/applications/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const app = await prisma.application.findUnique({
      where: { id },
      include: { domains: true },
    });

    if (!app) {
      return reply.code(404).send({ error: 'Aplicación no encontrada' });
    }

    for (const d of app.domains) {
      licenseCache.invalidate(d.hostname);
    }

    await prisma.application.delete({ where: { id } });
    return { message: 'Aplicación eliminada exitosamente' };
  });
}
