import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { z } from 'zod';
import { licenseCache } from '../../cache/license-cache.js';
import { TenantStatus } from '@prisma/client';

const domainSchema = z.object({
  hostname: z
    .string()
    .min(3)
    .max(253)
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$|^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/, 'Hostname inválido (ej: cliente.appzplay.online)'),
  tenantId: z.string().uuid(),
  applicationId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  status: z.nativeEnum(TenantStatus).default(TenantStatus.ACTIVE),
  notes: z.string().optional(),
});

export async function domainsRoutes(fastify: FastifyInstance) {
  // Listar todos los dominios
  fastify.get('/api/v1/domains', async () => {
    return prisma.domain.findMany({
      include: {
        tenant: true,
        application: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Crear o vincular dominio
  fastify.post('/api/v1/domains', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = domainSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos de dominio inválidos', details: parse.error.format() });
    }

    const cleanHost = parse.data.hostname.toLowerCase().trim();

    const existing = await prisma.domain.findUnique({
      where: { hostname: cleanHost },
    });

    if (existing) {
      return reply.code(409).send({ error: `El dominio '${cleanHost}' ya está registrado` });
    }

    const created = await prisma.domain.create({
      data: {
        ...parse.data,
        hostname: cleanHost,
      },
      include: {
        tenant: true,
        application: true,
      },
    });

    // Invalidar en caché
    licenseCache.invalidate(cleanHost);

    return reply.code(201).send(created);
  });

  // Actualizar dominio
  fastify.put('/api/v1/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parse = domainSchema.partial().safeParse(request.body);

    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const existing = await prisma.domain.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Dominio no encontrado' });
    }

    const cleanHost = parse.data.hostname ? parse.data.hostname.toLowerCase().trim() : existing.hostname;

    const updated = await prisma.domain.update({
      where: { id },
      data: {
        ...parse.data,
        ...(parse.data.hostname ? { hostname: cleanHost } : {}),
      },
      include: {
        tenant: true,
        application: true,
      },
    });

    licenseCache.invalidate(existing.hostname);
    licenseCache.invalidate(updated.hostname);

    return updated;
  });

  // Eliminar dominio
  fastify.delete('/api/v1/domains/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.domain.findUnique({ where: { id } });

    if (!existing) {
      return reply.code(404).send({ error: 'Dominio no encontrado' });
    }

    licenseCache.invalidate(existing.hostname);
    await prisma.domain.delete({ where: { id } });

    return { message: `Dominio '${existing.hostname}' eliminado con éxito` };
  });
}
