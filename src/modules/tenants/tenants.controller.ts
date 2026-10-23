import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { z } from 'zod';
import { licenseCache } from '../../cache/license-cache.js';
import { TenantStatus } from '@prisma/client';

const tenantSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[a-z0-9-_]+$/, 'Código de cliente alfanumérico'),
  businessName: z.string().min(2),
  contactName: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(TenantStatus).default(TenantStatus.ACTIVE),
});

export async function tenantsRoutes(fastify: FastifyInstance) {
  // Listar clientes con estadísticas
  fastify.get('/api/v1/tenants', async (request: FastifyRequest) => {
    const { status, search } = request.query as { status?: TenantStatus; search?: string };

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    return prisma.tenant.findMany({
      where,
      include: {
        domains: {
          include: { application: true },
        },
        licenses: {
          include: { application: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  // Detalle de un cliente
  fastify.get('/api/v1/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        domains: { include: { application: true } },
        licenses: { include: { application: true } },
      },
    });

    if (!tenant) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }
    return tenant;
  });

  // Crear cliente
  fastify.post('/api/v1/tenants', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = tenantSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const existing = await prisma.tenant.findUnique({
      where: { code: parse.data.code },
    });

    if (existing) {
      return reply.code(409).send({ error: `El código de cliente '${parse.data.code}' ya existe` });
    }

    const created = await prisma.tenant.create({
      data: parse.data,
    });

    return reply.code(201).send(created);
  });

  // Actualizar cliente
  fastify.put('/api/v1/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parse = tenantSchema.partial().safeParse(request.body);

    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: parse.data,
      include: { domains: true },
    });

    // Invalidar caché de todos los dominios de este tenant
    for (const d of updated.domains) {
      licenseCache.invalidate(d.hostname);
    }

    return updated;
  });

  // Eliminar cliente
  fastify.delete('/api/v1/tenants/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { domains: true },
    });

    if (!tenant) {
      return reply.code(404).send({ error: 'Cliente no encontrado' });
    }

    for (const d of tenant.domains) {
      licenseCache.invalidate(d.hostname);
    }

    await prisma.tenant.delete({ where: { id } });
    return { message: 'Cliente eliminado exitosamente' };
  });
}
