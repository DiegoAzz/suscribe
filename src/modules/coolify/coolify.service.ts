import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { LicenseStatus, TenantStatus, BillingCycle } from '@prisma/client';

export interface CoolifyAppSummary {
  uuid: string;
  name: string;
  fqdn: string | null;
  status: string;
  gitRepository?: string;
  isProtected: boolean;
  isLinkedToGateway: boolean;
  licenseStatus?: string;
}

export class CoolifyService {
  private defaultUrl = 'http://179.236.70.251:8000';
  private defaultToken = '1|4Pe2KTnwW6pfzcu3kwIGv5PSWL9MgndX1nRxuvJM03d426d8';

  async getConfig() {
    const urlSetting = await prisma.systemSetting.findUnique({ where: { key: 'coolify_api_url' } });
    const tokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'coolify_api_token' } });

    return {
      url: urlSetting?.value || this.defaultUrl,
      token: tokenSetting?.value || this.defaultToken,
      hasToken: Boolean(tokenSetting?.value || this.defaultToken),
    };
  }

  async saveConfig(url: string, token: string) {
    const cleanUrl = url.trim().replace(/\/$/, '');
    await prisma.systemSetting.upsert({
      where: { key: 'coolify_api_url' },
      update: { value: cleanUrl },
      create: { key: 'coolify_api_url', value: cleanUrl, description: 'Coolify Base API URL' },
    });

    if (token && token.trim()) {
      await prisma.systemSetting.upsert({
        where: { key: 'coolify_api_token' },
        update: { value: token.trim() },
        create: { key: 'coolify_api_token', value: token.trim(), description: 'Coolify Bearer API Token' },
      });
    }

    return this.getConfig();
  }

  async listApplications(): Promise<CoolifyAppSummary[]> {
    const { url, token } = await this.getConfig();
    if (!token) throw new Error('Coolify API token no configurado');

    const res = await fetch(`${url}/api/v1/applications`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Error al consultar Coolify API (${res.status}): ${await res.text()}`);
    }

    const apps = (await res.json()) as any[];
    const dbDomains = await prisma.domain.findMany({
      include: {
        tenant: true,
        application: {
          include: { licenses: true },
        },
      },
    });

    const domainMap = new Map<string, any>();
    for (const d of dbDomains) {
      domainMap.set(d.hostname.toLowerCase(), d);
    }

    return apps.map((app) => {
      let isProtected = false;
      if (app.custom_labels) {
        try {
          const decoded = Buffer.from(app.custom_labels, 'base64').toString('utf8');
          isProtected = decoded.includes('appzplay-auth');
        } catch {}
      }

      const fqdn = app.fqdn || null;
      let cleanHost = '';
      if (fqdn) {
        cleanHost = fqdn.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
      }

      const linked = cleanHost ? domainMap.get(cleanHost) : null;

      let licenseStatus: string | undefined;
      if (linked) {
        const license = linked.application?.licenses?.find((l: any) => l.tenantId === linked.tenantId);
        licenseStatus = license ? license.status : 'UNKNOWN';
      }

      return {
        uuid: app.uuid,
        name: app.name,
        fqdn,
        status: app.status || 'unknown',
        gitRepository: app.git_repository,
        isProtected,
        isLinkedToGateway: Boolean(linked),
        licenseStatus,
      };
    });
  }

  async protectApplication(uuid: string, appName?: string) {
    const { url, token } = await this.getConfig();
    if (!token) throw new Error('Coolify API token no configurado');

    // 1. Obtener detalles de la app en Coolify
    const res = await fetch(`${url}/api/v1/applications/${uuid}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`No se pudo obtener la aplicación con UUID ${uuid}: ${await res.text()}`);
    }

    const app = (await res.json()) as any;
    if (!app.fqdn) {
      throw new Error(`La aplicación ${app.name} no tiene un dominio FQDN asignado en Coolify.`);
    }

    const cleanDomain = app.fqdn.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim().toLowerCase();
    let labelsStr = '';
    if (app.custom_labels) {
      try {
        labelsStr = Buffer.from(app.custom_labels, 'base64').toString('utf8');
      } catch {
        labelsStr = '';
      }
    }

    // 2. Modificar etiquetas para inyectar appzplay-auth con identificador único por aplicación
    const gatewayUrl = env.APP_URL.replace(/\/$/, '');
    const mw = `appzplay-auth-${uuid.slice(0, 8)}`;
    const lines = labelsStr ? labelsStr.split('\n') : [];

    // Buscar router https y añadir el middleware
    let routerFound = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`https-0-${uuid}`) && lines[i].includes('.middlewares=')) {
        if (!lines[i].includes(mw)) {
          lines[i] = `${lines[i].trim()},${mw}`;
        }
        routerFound = true;
      }
    }

    // Si no encontró línea explícita de middlewares para https, insertarla tras entryPoints=https
    if (!routerFound) {
      const epIndex = lines.findIndex((l) => l.includes(`https-0-${uuid}.entryPoints=https`));
      if (epIndex !== -1) {
        lines.splice(epIndex + 1, 0, `traefik.http.routers.https-0-${uuid}.middlewares=gzip,${mw}`);
      } else {
        lines.push(`traefik.http.routers.https-0-${uuid}.middlewares=gzip,${mw}`);
      }
    }

    // Filtrar líneas antiguas de forwardauth si existieran para no duplicar
    const filteredLines = lines.filter((l) => !l.includes('appzplay-auth'));

    // Reinsertar middleware en la línea de router https si fue filtrada
    for (let i = 0; i < filteredLines.length; i++) {
      if (filteredLines[i].includes(`https-0-${uuid}`) && filteredLines[i].includes('.entryPoints=https')) {
        const next = filteredLines[i + 1] || '';
        if (!next.includes('.middlewares=')) {
          filteredLines.splice(i + 1, 0, `traefik.http.routers.https-0-${uuid}.middlewares=gzip,${mw}`);
        }
      }
    }

    // Insertar las 3 líneas de Traefik ForwardAuth con el dominio explícito
    filteredLines.push(
      `traefik.http.middlewares.${mw}.forwardauth.address=${gatewayUrl}/api/v1/forward-auth/verify?domain=${cleanDomain}`,
      `traefik.http.middlewares.${mw}.forwardauth.trustForwardHeader=true`,
      `traefik.http.middlewares.${mw}.forwardauth.authResponseHeaders=X-License-Status,X-License-Tenant,X-License-App,X-License-Warning`
    );

    const newLabelsBase64 = Buffer.from(filteredLines.join('\n')).toString('base64');

    // 3. Enviar PATCH a Coolify para actualizar etiquetas
    const patchRes = await fetch(`${url}/api/v1/applications/${uuid}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ custom_labels: newLabelsBase64 }),
    });

    if (!patchRes.ok) {
      throw new Error(`Error al actualizar etiquetas en Coolify: ${await patchRes.text()}`);
    }

    // 4. Ordenar despliegue en Coolify
    const deployRes = await fetch(`${url}/api/v1/deploy?uuid=${uuid}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const deployData = await deployRes.json().catch(() => ({}));

    // 5. Vincular en base de datos de Suscribe si aún no existe
    await this.ensureDomainRegistered(cleanDomain, appName || app.name || cleanDomain);

    return {
      success: true,
      domain: cleanDomain,
      uuid,
      deployment: deployData,
      message: `Etiquetas inyectadas con éxito en ${cleanDomain} y despliegue iniciado.`,
    };
  }

  async unprotectApplication(uuid: string) {
    const { url, token } = await this.getConfig();
    if (!token) throw new Error('Coolify API token no configurado');

    const res = await fetch(`${url}/api/v1/applications/${uuid}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`App no encontrada: ${await res.text()}`);

    const app = (await res.json()) as any;
    let labelsStr = '';
    if (app.custom_labels) {
      labelsStr = Buffer.from(app.custom_labels, 'base64').toString('utf8');
    }

    // Remover appzplay-auth
    const lines = labelsStr.split('\n').filter((l) => !l.includes('appzplay-auth.forwardauth.'));
    const updated = lines.map((l) => {
      if (l.includes('.middlewares=')) {
        return l.replace(',appzplay-auth', '').replace('appzplay-auth,', '').replace('appzplay-auth', '');
      }
      return l;
    });

    const newLabelsBase64 = Buffer.from(updated.join('\n')).toString('base64');

    await fetch(`${url}/api/v1/applications/${uuid}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ custom_labels: newLabelsBase64 }),
    });

    await fetch(`${url}/api/v1/deploy?uuid=${uuid}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    return { success: true, message: `Protección removida de ${app.name} y redesplegada.` };
  }

  private async ensureDomainRegistered(hostname: string, displayName: string) {
    const existing = await prisma.domain.findFirst({
      where: {
        OR: [
          { hostname },
          { hostname: `https://${hostname}` },
          { hostname: `https://${hostname}/` },
          { hostname: `http://${hostname}` },
          { hostname: `http://${hostname}/` },
        ],
      },
    });

    if (existing) return;

    // Crear Tenant
    const cleanCode = `cli-${hostname.split('.')[0]}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    let tenant = await prisma.tenant.findUnique({ where: { code: cleanCode } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: {
          code: cleanCode,
          businessName: displayName,
          status: TenantStatus.ACTIVE,
        },
      });
    }

    // Crear Application
    const appSlug = `app-${hostname.split('.')[0]}`.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    let application = await prisma.application.findUnique({ where: { slug: appSlug } });
    if (!application) {
      application = await prisma.application.create({
        data: {
          slug: appSlug,
          name: displayName,
          isActive: true,
          defaultGracePeriodDays: 3,
        },
      });
    }

    // Crear Domain
    await prisma.domain.create({
      data: {
        hostname,
        tenantId: tenant.id,
        applicationId: application.id,
        isPrimary: true,
        status: TenantStatus.ACTIVE,
      },
    });

    // Crear Licencia Activa por 30 días
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const licenseKey = `LIC-${cleanCode.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    await prisma.license.create({
      data: {
        licenseKey,
        tenantId: tenant.id,
        applicationId: application.id,
        status: LicenseStatus.ACTIVE,
        expiresAt,
        gracePeriodDays: 3,
        billingCycle: BillingCycle.MONTHLY,
      },
    });
  }
}

export const coolifyService = new CoolifyService();
