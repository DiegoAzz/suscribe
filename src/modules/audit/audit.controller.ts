import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { licenseCache } from '../../cache/license-cache.js';
import { Decision, LicenseStatus, TenantStatus } from '@prisma/client';

export async function auditRoutes(fastify: FastifyInstance) {
  // Resumen de Métricas Generales del Dashboard
  fastify.get('/api/v1/dashboard/metrics', async () => {
    const [
      totalTenants,
      activeTenants,
      totalDomains,
      activeDomains,
      totalLicenses,
      activeLicenses,
      suspendedLicenses,
      pastDueLicenses,
      auditCounts,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
      prisma.domain.count(),
      prisma.domain.count({ where: { status: TenantStatus.ACTIVE } }),
      prisma.license.count(),
      prisma.license.count({ where: { status: LicenseStatus.ACTIVE } }),
      prisma.license.count({ where: { status: LicenseStatus.SUSPENDED } }),
      prisma.license.count({ where: { status: LicenseStatus.PAST_DUE } }),
      prisma.accessAuditLog.groupBy({
        by: ['decision'],
        _count: { id: true },
      }),
    ]);

    const decisionsMap: Record<string, number> = {
      ALLOW: 0,
      DENY: 0,
      BYPASS: 0,
    };
    for (const item of auditCounts) {
      decisionsMap[item.decision] = item._count.id;
    }

    return {
      tenants: {
        total: totalTenants,
        active: activeTenants,
      },
      domains: {
        total: totalDomains,
        active: activeDomains,
      },
      licenses: {
        total: totalLicenses,
        active: activeLicenses,
        suspended: suspendedLicenses,
        pastDue: pastDueLicenses,
      },
      traffic: {
        totalRequests: decisionsMap.ALLOW + decisionsMap.DENY + decisionsMap.BYPASS,
        allowed: decisionsMap.ALLOW,
        denied: decisionsMap.DENY,
        bypassed: decisionsMap.BYPASS,
      },
      cache: {
        activeKeys: licenseCache.size(),
      },
    };
  });

  // Lista de logs de auditoría en vivo
  fastify.get('/api/v1/audit/logs', async (request: FastifyRequest) => {
    const { decision, domain, limit = '50' } = request.query as {
      decision?: Decision;
      domain?: string;
      limit?: string;
    };

    const take = Math.min(parseInt(limit, 10) || 50, 200);
    const where: Record<string, unknown> = {};

    if (decision) where.decision = decision;
    if (domain) where.domain = { contains: domain, mode: 'insensitive' };

    const logs = await prisma.accessAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Formatear bigint id a string para JSON
    return logs.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));
  });

  // Purgar caché manual desde el panel
  fastify.post('/api/v1/cache/purge', async () => {
    const count = licenseCache.size();
    licenseCache.clear();
    return { message: 'Caché de ForwardAuth purgada con éxito', keysPurged: count };
  });
}
