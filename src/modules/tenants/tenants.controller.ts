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

  // Registro Completo de Nuevo Sitio/Cliente (Tenant + Dominio + Licencia en 1 solo paso)
  fastify.post('/api/v1/tenants/onboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const onboardSchema = z.object({
      code: z.string().min(2).max(50).regex(/^[a-z0-9-_]+$/, 'Código de cliente alfanumérico'),
      businessName: z.string().min(2),
      contactName: z.string().optional(),
      email: z.string().email().optional().or(z.literal('')),
      phone: z.string().optional(),
      notes: z.string().optional(),
      applicationId: z.string().min(1),
      hostname: z.string().min(3).max(253),
      daysActive: z.number().int().min(1).default(30),
    });

    const parse = onboardSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos incompletos o inválidos', details: parse.error.format() });
    }

    const data = parse.data;
    const cleanHost = data.hostname.toLowerCase().trim();

    // 1. Validar que no exista el código ni el hostname
    const existingCode = await prisma.tenant.findUnique({ where: { code: data.code } });
    if (existingCode) {
      return reply.code(409).send({ error: `El código '${data.code}' ya existe.` });
    }

    const existingHost = await prisma.domain.findUnique({ where: { hostname: cleanHost } });
    if (existingHost) {
      return reply.code(409).send({ error: `El dominio '${cleanHost}' ya está registrado en el Gateway.` });
    }

    // 2. Resolver la aplicación (por ID o slug)
    const app = await prisma.application.findFirst({
      where: { OR: [{ id: data.applicationId }, { slug: data.applicationId }] },
    });

    if (!app) {
      return reply.code(404).send({ error: 'Aplicación seleccionada no encontrada.' });
    }

    // 3. Crear en transacción atómica: Tenant + Dominio + Licencia
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.daysActive * 24 * 60 * 60 * 1000);
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const licenseKey = `LIC-${data.code.toUpperCase()}-${rand}`;

    const tenant = await prisma.tenant.create({
      data: {
        code: data.code,
        businessName: data.businessName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        status: TenantStatus.ACTIVE,
        domains: {
          create: {
            hostname: cleanHost,
            applicationId: app.id,
            isPrimary: true,
            status: TenantStatus.ACTIVE,
          },
        },
        licenses: {
          create: {
            licenseKey,
            applicationId: app.id,
            status: 'ACTIVE',
            startsAt: now,
            expiresAt,
            gracePeriodDays: app.defaultGracePeriodDays || 3,
            billingCycle: 'MONTHLY',
          },
        },
      },
      include: {
        domains: { include: { application: true } },
        licenses: { include: { application: true } },
      },
    });

    licenseCache.invalidate(cleanHost);

    return reply.code(201).send({
      message: `Cliente '${tenant.businessName}' registrado exitosamente con dominio '${cleanHost}' y licencia activa.`,
      tenant,
    });
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
