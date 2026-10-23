import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { z } from 'zod';
import { licenseCache } from '../../cache/license-cache.js';
import { LicenseStatus, BillingCycle, TenantStatus } from '@prisma/client';

const licenseSchema = z.object({
  tenantId: z.string().uuid(),
  applicationId: z.string().uuid(),
  licenseKey: z.string().optional(),
  status: z.nativeEnum(LicenseStatus).default(LicenseStatus.ACTIVE),
  startsAt: z.string().datetime().or(z.date()).optional(),
  expiresAt: z.string().datetime().or(z.date()),
  gracePeriodDays: z.number().int().min(0).max(60).default(3),
  billingCycle: z.nativeEnum(BillingCycle).default(BillingCycle.MONTHLY),
  amount: z.number().optional(),
  currency: z.string().default('USD'),
  suspensionReason: z.string().optional(),
  notes: z.string().optional(),
});

function generateLicenseKey(prefix = 'LIC'): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  const time = Date.now().toString(36).toUpperCase();
  return `${prefix}-${time}-${rand}`;
}

export async function licensesRoutes(fastify: FastifyInstance) {
  // Listar licencias
  fastify.get('/api/v1/licenses', async (request: FastifyRequest) => {
    const { status, tenantId, applicationId } = request.query as {
      status?: LicenseStatus;
      tenantId?: string;
      applicationId?: string;
    };

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    if (applicationId) where.applicationId = applicationId;

    return prisma.license.findMany({
      where,
      include: {
        tenant: {
          include: { domains: true },
        },
        application: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  // Crear o renovar licencia
  fastify.post('/api/v1/licenses', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = licenseSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos de licencia inválidos', details: parse.error.format() });
    }

    const { tenantId, applicationId, ...data } = parse.data;
    const licenseKey = data.licenseKey || generateLicenseKey();

    // Upsert para garantizar unicidad por par tenantId - applicationId
    const license = await prisma.license.upsert({
      where: {
        tenantId_applicationId: { tenantId, applicationId },
      },
      update: {
        ...data,
        expiresAt: new Date(data.expiresAt),
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      },
      create: {
        ...data,
        tenantId,
        applicationId,
        licenseKey,
        expiresAt: new Date(data.expiresAt),
        startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
      },
      include: {
        tenant: { include: { domains: true } },
        application: true,
      },
    });

    // Invalidar en caché todos los dominios del inquilino
    for (const d of license.tenant.domains) {
      licenseCache.invalidate(d.hostname);
    }

    return reply.code(201).send(license);
  });

  // ACCIÓN RÁPIDA 1: Suspender Inmediatamente (1 Clic)
  fastify.post('/api/v1/licenses/:id/suspend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { reason?: string }) || {};
    const reason = body.reason || 'Suscripción suspendida manualmente desde el panel de control.';

    const license = await prisma.license.findUnique({
      where: { id },
      include: { tenant: { include: { domains: true } }, application: true },
    });

    if (!license) {
      return reply.code(404).send({ error: 'Licencia no encontrada' });
    }

    const updated = await prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.SUSPENDED,
        suspensionReason: reason,
        suspendedAt: new Date(),
      },
      include: { tenant: { include: { domains: true } }, application: true },
    });

    // Invalida la caché de ForwardAuth al instante
    for (const d of updated.tenant.domains) {
      licenseCache.invalidate(d.hostname);
    }

    return {
      message: `Licencia suspendida exitosamente para el cliente '${updated.tenant.businessName}'.`,
      license: updated,
      domainsAffected: updated.tenant.domains.map((d) => d.hostname),
    };
  });

  // ACCIÓN RÁPIDA 2: Reactivar Inmediatamente (1 Clic)
  fastify.post('/api/v1/licenses/:id/reactivate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const license = await prisma.license.findUnique({
      where: { id },
      include: { tenant: { include: { domains: true } }, application: true },
    });

    if (!license) {
      return reply.code(404).send({ error: 'Licencia no encontrada' });
    }

    // Si la fecha de expiración ya pasó, extendemos 30 días a partir de hoy
    let newExpiresAt = license.expiresAt;
    if (new Date() >= license.expiresAt) {
      newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const updated = await prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVE,
        suspensionReason: null,
        reactivatedAt: new Date(),
        expiresAt: newExpiresAt,
      },
      include: { tenant: { include: { domains: true } }, application: true },
    });

    for (const d of updated.tenant.domains) {
      licenseCache.invalidate(d.hostname);
    }

    return {
      message: `Licencia reactivada exitosamente para el cliente '${updated.tenant.businessName}'.`,
      license: updated,
      domainsAffected: updated.tenant.domains.map((d) => d.hostname),
    };
  });

  // ACCIÓN RÁPIDA 3: Extender Vigencia (+N Días)
  fastify.post('/api/v1/licenses/:id/extend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { days?: number }) || {};
    const daysToAdd = body.days && body.days > 0 ? body.days : 30;

    const license = await prisma.license.findUnique({
      where: { id },
      include: { tenant: { include: { domains: true } }, application: true },
    });

    if (!license) {
      return reply.code(404).send({ error: 'Licencia no encontrada' });
    }

    // Base para sumar los días: la mayor entre la fecha actual y la fecha de expiración previa
    const baseDate = new Date() > license.expiresAt ? new Date() : license.expiresAt;
    const newExpiresAt = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const updated = await prisma.license.update({
      where: { id },
      data: {
        status: LicenseStatus.ACTIVE,
        expiresAt: newExpiresAt,
        suspensionReason: null,
      },
      include: { tenant: { include: { domains: true } }, application: true },
    });

    for (const d of updated.tenant.domains) {
      licenseCache.invalidate(d.hostname);
    }

    return {
      message: `Licencia extendida ${daysToAdd} días exitosamente. Nueva fecha: ${newExpiresAt.toISOString()}`,
      license: updated,
    };
  });

  // Consulta pública rápida de estado de dominio para la pantalla de suspensión
  fastify.get('/api/v1/licenses/check-status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { domain } = request.query as { domain?: string };
    if (!domain) {
      return reply.code(400).send({ allowed: false, error: 'Dominio requerido' });
    }

    const cleanHost = domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').split(':')[0].trim().toLowerCase();

    try {
      const foundDomain = await prisma.domain.findUnique({
        where: { hostname: cleanHost },
        include: {
          tenant: {
            include: {
              licenses: {
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      if (!foundDomain || !foundDomain.tenant) {
        return {
          allowed: false,
          status: 'NOT_FOUND',
          reason: 'Dominio no registrado en el sistema de licencias.',
        };
      }

      if (foundDomain.tenant.status !== TenantStatus.ACTIVE) {
        return {
          allowed: false,
          status: 'TENANT_INACTIVE',
          reason: 'El cliente se encuentra desactivado o archivado en la plataforma.',
        };
      }

      const license = foundDomain.tenant.licenses[0];
      if (!license) {
        return {
          allowed: false,
          status: 'NO_LICENSE',
          reason: 'No hay licencias asignadas para este dominio.',
        };
      }

      const now = new Date();
      const expiresAt = new Date(license.expiresAt);
      const gracePeriodDays = license.gracePeriodDays ?? 3;
      const graceExpiresAt = new Date(expiresAt.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

      if (license.status === LicenseStatus.SUSPENDED) {
        return {
          allowed: false,
          status: 'SUSPENDED',
          reason: license.suspensionReason || 'Suscripción suspendida administrativamente.',
        };
      }

      if (license.status === LicenseStatus.CANCELLED) {
        return {
          allowed: false,
          status: 'CANCELLED',
          reason: license.suspensionReason || 'Suscripción cancelada permanentemente.',
        };
      }

      if (now > expiresAt && now > graceExpiresAt) {
        return {
          allowed: false,
          status: 'EXPIRED',
          reason: 'Suscripción vencida. Período de gracia agotado.',
        };
      }

      return {
        allowed: true,
        status: license.status,
        expiresAt: license.expiresAt,
      };
    } catch {
      return reply.code(500).send({
        allowed: false,
        status: 'ERROR',
        reason: 'Error al consultar el estado de la suscripción.',
      });
    }
  });
}
