import { prisma } from '../../db/prisma.js';
import { licenseCache, CachedLicenseDecision } from '../../cache/license-cache.js';
import { env } from '../../config/env.js';
import { Decision, HttpMethod, LicenseStatus, TenantStatus } from '@prisma/client';

export interface ForwardAuthCheckParams {
  host?: string;
  uri?: string;
  method?: string;
  clientIp?: string;
  userAgent?: string;
  acceptHeader?: string;
}

export interface ForwardAuthResult {
  allowed: boolean;
  statusCode: number;
  headers?: Record<string, string>;
  redirectUrl?: string;
  jsonBody?: Record<string, unknown>;
  reason?: string;
  latencyMs: number;
}

// Helper para matching simple de rutas estilo wildcard (ej: /api/webhooks/* o /health*)
function matchPath(pattern: string, path: string): boolean {
  if (pattern === '*' || pattern === '/*') return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  return pattern === path;
}

export class ForwardAuthService {
  async verifyRequest(params: ForwardAuthCheckParams): Promise<ForwardAuthResult> {
    const startTime = Date.now();

    // 1. Extraer y sanear el hostname
    const rawHost = params.host || 'unknown-host';
    const cleanHost = rawHost.split(':')[0].trim().toLowerCase();
    const uri = params.uri || '/';
    const method = (params.method || 'GET').toUpperCase();
    const isBrowserHtml = (params.acceptHeader || '').includes('text/html') && method === 'GET';

    // 2. Verificar reglas de bypass
    const isBypassed = await this.checkBypassRules(uri, method);
    if (isBypassed) {
      const latencyMs = Date.now() - startTime;
      this.logAudit({
        domain: cleanHost,
        path: uri,
        method,
        clientIp: params.clientIp,
        userAgent: params.userAgent,
        decision: Decision.BYPASS,
        reason: 'Ruta en lista blanca de bypass',
        latencyMs,
      });

      return {
        allowed: true,
        statusCode: 200,
        headers: {
          'X-License-Status': 'BYPASS',
          'X-ForwardAuth-Time': `${latencyMs}ms`,
        },
        latencyMs,
      };
    }

    // 3. Consultar caché en memoria
    const cached = licenseCache.get(cleanHost);
    if (cached) {
      const latencyMs = Date.now() - startTime;
      return this.formatDecisionResponse(cached, cleanHost, uri, isBrowserHtml, latencyMs);
    }

    // 4. Consultar base de datos
    let decision: CachedLicenseDecision;

    try {
      const domainRecord = await prisma.domain.findUnique({
        where: { hostname: cleanHost },
        include: {
          tenant: true,
          application: true,
        },
      });

      if (!domainRecord) {
        decision = {
          allowed: false,
          statusCode: 403,
          reason: `Dominio '${cleanHost}' no registrado en AppzPlay License Gateway.`,
          cachedAt: Date.now(),
        };
      } else if (domainRecord.status !== TenantStatus.ACTIVE || domainRecord.tenant.status !== TenantStatus.ACTIVE) {
        decision = {
          allowed: false,
          statusCode: 403,
          reason: 'El cliente o dominio se encuentra administrativamente suspendido.',
          tenantCode: domainRecord.tenant.code,
          appSlug: domainRecord.application.slug,
          cachedAt: Date.now(),
        };
      } else if (!domainRecord.application.isActive) {
        decision = {
          allowed: false,
          statusCode: 403,
          reason: `La aplicación '${domainRecord.application.name}' está temporalmente fuera de servicio.`,
          tenantCode: domainRecord.tenant.code,
          appSlug: domainRecord.application.slug,
          cachedAt: Date.now(),
        };
      } else {
        // Consultar licencia
        const license = await prisma.license.findUnique({
          where: {
            tenantId_applicationId: {
              tenantId: domainRecord.tenantId,
              applicationId: domainRecord.applicationId,
            },
          },
        });

        if (!license) {
          decision = {
            allowed: false,
            statusCode: 403,
            reason: 'No existe una licencia asociada a este cliente para esta aplicación.',
            tenantCode: domainRecord.tenant.code,
            appSlug: domainRecord.application.slug,
            cachedAt: Date.now(),
          };
        } else {
          decision = this.evaluateLicenseState(license, domainRecord.tenant.code, domainRecord.application.slug);
        }
      }
    } catch (err) {
      console.error('[ForwardAuth] Error al consultar base de datos:', err);
      // Falla segura: permitir o denegar según política. Por seguridad empresarial denegamos con 500/403.
      decision = {
        allowed: false,
        statusCode: 503,
        reason: 'Error interno del servicio de verificación de licencias.',
        cachedAt: Date.now(),
      };
    }

    // 5. Guardar en caché LRU si no fue error 503
    if (decision.statusCode !== 503) {
      licenseCache.set(cleanHost, decision);
    }

    // 6. Auditoría asíncrona
    const latencyMs = Date.now() - startTime;
    this.logAudit({
      domain: cleanHost,
      path: uri,
      method,
      clientIp: params.clientIp,
      userAgent: params.userAgent,
      decision: decision.allowed ? Decision.ALLOW : Decision.DENY,
      reason: decision.reason,
      tenantCode: decision.tenantCode,
      appSlug: decision.appSlug,
      latencyMs,
    });

    return this.formatDecisionResponse(decision, cleanHost, uri, isBrowserHtml, latencyMs);
  }

  private evaluateLicenseState(
    license: {
      status: LicenseStatus;
      expiresAt: Date;
      gracePeriodDays: number;
      suspensionReason?: string | null;
    },
    tenantCode: string,
    appSlug: string,
  ): CachedLicenseDecision {
    const now = new Date();
    const expiresAt = new Date(license.expiresAt);
    const gracePeriodDays = license.gracePeriodDays ?? 3;
    const graceExpiresAt = new Date(expiresAt.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);

    // 1. Estado Suspendido o Cancelado
    if (license.status === LicenseStatus.SUSPENDED) {
      return {
        allowed: false,
        statusCode: 403,
        reason: license.suspensionReason || 'Suscripción suspendida administrativamente.',
        tenantCode,
        appSlug,
        cachedAt: Date.now(),
      };
    }

    if (license.status === LicenseStatus.CANCELLED) {
      return {
        allowed: false,
        statusCode: 403,
        reason: 'Suscripción cancelada definitivamente.',
        tenantCode,
        appSlug,
        cachedAt: Date.now(),
      };
    }

    // 2. Estado Activo o Trial
    if (license.status === LicenseStatus.ACTIVE || license.status === LicenseStatus.TRIAL) {
      if (now <= expiresAt) {
        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          allowed: true,
          statusCode: 200,
          tenantCode,
          appSlug,
          headers: {
            'X-License-Status': license.status,
            'X-License-Days-Left': daysLeft.toString(),
            'X-License-Tenant': tenantCode,
            'X-License-App': appSlug,
          },
          cachedAt: Date.now(),
        };
      }

      // Venció la fecha pero revisamos si está en período de gracia
      if (now <= graceExpiresAt) {
        const graceDaysLeft = Math.ceil((graceExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          allowed: true,
          statusCode: 200,
          tenantCode,
          appSlug,
          warningHeader: `Suscripción vencida. En período de gracia (${graceDaysLeft} días restantes).`,
          headers: {
            'X-License-Status': 'PAST_DUE_IN_GRACE',
            'X-License-Grace-Days-Left': graceDaysLeft.toString(),
            'X-License-Tenant': tenantCode,
            'X-License-App': appSlug,
          },
          cachedAt: Date.now(),
        };
      }

      // Venció y superó los días de gracia
      return {
        allowed: false,
        statusCode: 403,
        reason: 'Suscripción vencida. Ha expirado el período de gracia otorgado.',
        tenantCode,
        appSlug,
        cachedAt: Date.now(),
      };
    }

    // 3. Estado Past Due explícito
    if (license.status === LicenseStatus.PAST_DUE) {
      if (now <= graceExpiresAt) {
        return {
          allowed: true,
          statusCode: 200,
          tenantCode,
          appSlug,
          warningHeader: 'Suscripción en mora (período de gracia activo).',
          headers: {
            'X-License-Status': 'PAST_DUE_IN_GRACE',
            'X-License-Tenant': tenantCode,
            'X-License-App': appSlug,
          },
          cachedAt: Date.now(),
        };
      }

      return {
        allowed: false,
        statusCode: 403,
        reason: 'Suscripción en mora con plazo de gracia expirado.',
        tenantCode,
        appSlug,
        cachedAt: Date.now(),
      };
    }

    // 4. Expirada
    return {
      allowed: false,
      statusCode: 403,
      reason: 'Licencia expirada.',
      tenantCode,
      appSlug,
      cachedAt: Date.now(),
    };
  }

  private async checkBypassRules(uri: string, method: string): Promise<boolean> {
    // 1. Reglas críticas del sistema siempre activas en memoria (sin depender de PostgreSQL)
    const systemBypassPatterns = [
      '/.well-known/*',
      '/health',
      '/health/*',
      '/favicon.ico',
      '/api/v1/forward-auth/*',
      '/api/webhooks/*',
    ];

    for (const pattern of systemBypassPatterns) {
      if (matchPath(pattern, uri)) {
        return true;
      }
    }

    // 2. Reglas dinámicas configuradas en la base de datos
    try {
      const activeRules = await prisma.bypassRule.findMany({
        where: { isActive: true },
      });

      for (const rule of activeRules) {
        if (rule.httpMethod !== HttpMethod.ALL && rule.httpMethod !== method) {
          continue;
        }
        if (matchPath(rule.pathPattern, uri)) {
          return true;
        }
      }
    } catch {
      // Si la base de datos aún no está levantada o en tests aislados, las reglas del sistema continúan funcionando
    }
    return false;
  }

  private formatDecisionResponse(
    decision: CachedLicenseDecision,
    cleanHost: string,
    uri: string,
    isBrowserHtml: boolean,
    latencyMs: number,
  ): ForwardAuthResult {
    if (decision.allowed) {
      return {
        allowed: true,
        statusCode: 200,
        headers: {
          ...(decision.headers || {}),
          'X-ForwardAuth-Time': `${latencyMs}ms`,
        },
        latencyMs,
      };
    }

    // Si fue denegado:
    // Para navegación web en navegador redirigimos a la página informativa de suspensión
    if (isBrowserHtml) {
      const redirectUrl = `${env.SUSPENDED_REDIRECT_URL}?domain=${encodeURIComponent(cleanHost)}&reason=${encodeURIComponent(decision.reason || '')}&uri=${encodeURIComponent(uri)}`;
      return {
        allowed: false,
        statusCode: 302,
        redirectUrl,
        reason: decision.reason,
        latencyMs,
      };
    }

    // Para APIs o peticiones de datos devolvemos 403 JSON
    return {
      allowed: false,
      statusCode: decision.statusCode || 403,
      jsonBody: {
        error: 'Acceso Denegado por AppzPlay License Gateway',
        domain: cleanHost,
        reason: decision.reason,
        status: 'SUSPENDED_OR_EXPIRED',
        supportUrl: env.APP_URL,
      },
      reason: decision.reason,
      latencyMs,
    };
  }

  private logAudit(data: {
    domain: string;
    path: string;
    method: string;
    clientIp?: string;
    userAgent?: string;
    decision: Decision;
    reason?: string;
    tenantCode?: string;
    appSlug?: string;
    latencyMs: number;
  }): void {
    if (!env.AUDIT_LOG_ENABLED) return;

    // Ejecución asíncrona no bloqueante
    setImmediate(async () => {
      try {
        await prisma.accessAuditLog.create({
          data: {
            domain: data.domain,
            path: data.path.substring(0, 500),
            method: data.method,
            clientIp: data.clientIp?.substring(0, 45),
            userAgent: data.userAgent?.substring(0, 300),
            decision: data.decision,
            reason: data.reason?.substring(0, 255),
            tenantCode: data.tenantCode,
            appSlug: data.appSlug,
            latencyMs: data.latencyMs,
          },
        });
      } catch (err) {
        console.error('[AuditLog] Error al registrar log de acceso:', err);
      }
    });
  }
}

export const forwardAuthService = new ForwardAuthService();
