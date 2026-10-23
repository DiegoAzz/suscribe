import { PrismaClient, AdminRole, TenantStatus, LicenseStatus, BillingCycle, HttpMethod } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Seed de AppzPlay License Gateway ---');

  // 1. Admin User
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@appzplay.online';
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'AppzPlaySuperAdmin2026!';
  const adminName = process.env.DEFAULT_ADMIN_NAME || 'AppzPlay Administrator';

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      fullName: adminName,
      role: AdminRole.SUPERADMIN,
      isActive: true,
    },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: AdminRole.SUPERADMIN,
      isActive: true,
    },
  });
  console.log(`[Seed] SuperAdmin configurado: ${admin.email}`);

  // 2. Aplicaciones
  const appsData = [
    {
      slug: 'dummy-app',
      name: 'Dummy App (Pruebas ForwardAuth)',
      description: 'Aplicación ficticia para verificación en vivo de bloqueo y autorización por dominio',
      defaultRedirectUrl: 'https://suscribe.appzplay.online/suspended',
      defaultGracePeriodDays: 3,
    },
    {
      slug: 'newsflow-ai',
      name: 'NewsFlow AI',
      description: 'Plataforma de curación, resumen con IA y publicación automatizada en Facebook',
      defaultRedirectUrl: 'https://face.appzplay.online',
      defaultGracePeriodDays: 5,
    },
    {
      slug: 'turnoya',
      name: 'TurnoYa',
      description: 'Sistema SaaS de reservas, turnos y citas en línea',
      defaultRedirectUrl: 'https://turnoya.appzplay.online',
      defaultGracePeriodDays: 3,
    },
    {
      slug: 'comidaya',
      name: 'ComidaYa',
      description: 'Plataforma de delivery, pedidos y cartas digitales para restaurantes',
      defaultRedirectUrl: 'https://comidaya.appzplay.online',
      defaultGracePeriodDays: 3,
    },
  ];

  const appMap: Record<string, string> = {};
  for (const app of appsData) {
    const created = await prisma.application.upsert({
      where: { slug: app.slug },
      update: app,
      create: app,
    });
    appMap[app.slug] = created.id;
    console.log(`[Seed] Aplicación registrada: ${created.name} (${created.slug})`);
  }

  // 3. Reglas Globales de Bypass (Rutas permitidas sin bloqueo de licencia)
  const defaultBypasses = [
    {
      pathPattern: '/.well-known/*',
      httpMethod: HttpMethod.ALL,
      description: 'Certificados SSL / ACME Challenge',
    },
    {
      pathPattern: '/health*',
      httpMethod: HttpMethod.GET,
      description: 'Healthchecks de Docker y Traefik',
    },
    {
      pathPattern: '/api/webhooks/*',
      httpMethod: HttpMethod.POST,
      description: 'Webhooks de pasarelas de pago y proveedores externos',
    },
  ];

  for (const bypass of defaultBypasses) {
    const existing = await prisma.bypassRule.findFirst({
      where: { pathPattern: bypass.pathPattern, applicationId: null },
    });
    if (!existing) {
      await prisma.bypassRule.create({
        data: {
          pathPattern: bypass.pathPattern,
          httpMethod: bypass.httpMethod,
          description: bypass.description,
          isActive: true,
        },
      });
      console.log(`[Seed] Regla de Bypass creada: ${bypass.pathPattern}`);
    }
  }

  // 4. Inquilinos (Tenants) y Dominios de Prueba
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  const dummyAppId = appMap['dummy-app'];

  // Tenant A: Activo
  const tenantActivo = await prisma.tenant.upsert({
    where: { code: 'tenant-demo-activo' },
    update: { businessName: 'Restaurante El Roble (Demo Activo)', status: TenantStatus.ACTIVE },
    create: {
      code: 'tenant-demo-activo',
      businessName: 'Restaurante El Roble (Demo Activo)',
      contactName: 'Carlos Gómez',
      email: 'carlos@elroble.com',
      phone: '+57 300 111 2233',
      status: TenantStatus.ACTIVE,
    },
  });

  await prisma.domain.upsert({
    where: { hostname: 'activo.test.local' },
    update: { tenantId: tenantActivo.id, applicationId: dummyAppId, status: TenantStatus.ACTIVE },
    create: {
      hostname: 'activo.test.local',
      tenantId: tenantActivo.id,
      applicationId: dummyAppId,
      isPrimary: true,
      status: TenantStatus.ACTIVE,
    },
  });

  await prisma.license.upsert({
    where: { tenantId_applicationId: { tenantId: tenantActivo.id, applicationId: dummyAppId } },
    update: {
      status: LicenseStatus.ACTIVE,
      startsAt: now,
      expiresAt: thirtyDaysLater,
      gracePeriodDays: 3,
      billingCycle: BillingCycle.MONTHLY,
    },
    create: {
      licenseKey: 'LIC-ACTIVO-2026-XYZ',
      tenantId: tenantActivo.id,
      applicationId: dummyAppId,
      status: LicenseStatus.ACTIVE,
      startsAt: now,
      expiresAt: thirtyDaysLater,
      gracePeriodDays: 3,
      billingCycle: BillingCycle.MONTHLY,
      amount: 49.0,
      currency: 'USD',
    },
  });
  console.log('[Seed] Tenant Demo Activo configurado (activo.test.local)');

  // Tenant B: En Período de Gracia (Past Due pero dentro de gracia)
  const tenantGracia = await prisma.tenant.upsert({
    where: { code: 'tenant-demo-gracia' },
    update: { businessName: 'Clínica Dental Sonrisas (Demo Gracia)', status: TenantStatus.ACTIVE },
    create: {
      code: 'tenant-demo-gracia',
      businessName: 'Clínica Dental Sonrisas (Demo Gracia)',
      contactName: 'Dra. María Vargas',
      email: 'maria@sonrisas.com',
      phone: '+57 300 444 5566',
      status: TenantStatus.ACTIVE,
    },
  });

  await prisma.domain.upsert({
    where: { hostname: 'gracia.test.local' },
    update: { tenantId: tenantGracia.id, applicationId: dummyAppId, status: TenantStatus.ACTIVE },
    create: {
      hostname: 'gracia.test.local',
      tenantId: tenantGracia.id,
      applicationId: dummyAppId,
      isPrimary: true,
      status: TenantStatus.ACTIVE,
    },
  });

  await prisma.license.upsert({
    where: { tenantId_applicationId: { tenantId: tenantGracia.id, applicationId: dummyAppId } },
    update: {
      status: LicenseStatus.PAST_DUE,
      startsAt: tenDaysAgo,
      expiresAt: oneDayAgo, // Venció ayer, pero con 3 días de gracia tiene acceso
      gracePeriodDays: 3,
      billingCycle: BillingCycle.MONTHLY,
    },
    create: {
      licenseKey: 'LIC-GRACIA-2026-ABC',
      tenantId: tenantGracia.id,
      applicationId: dummyAppId,
      status: LicenseStatus.PAST_DUE,
      startsAt: tenDaysAgo,
      expiresAt: oneDayAgo,
      gracePeriodDays: 3,
      billingCycle: BillingCycle.MONTHLY,
      amount: 49.0,
      currency: 'USD',
    },
  });
  console.log('[Seed] Tenant Demo Gracia configurado (gracia.test.local)');

  // Tenant C: Suspendido
  const tenantSuspendido = await prisma.tenant.upsert({
    where: { code: 'tenant-demo-suspendido' },
    update: { businessName: 'AutoSpa Express (Demo Suspendido)', status: TenantStatus.SUSPENDED },
    create: {
      code: 'tenant-demo-suspendido',
      businessName: 'AutoSpa Express (Demo Suspendido)',
      contactName: 'Pedro Martínez',
      email: 'pedro@autospa.com',
      phone: '+57 300 777 8899',
      status: TenantStatus.SUSPENDED,
    },
  });

  await prisma.domain.upsert({
    where: { hostname: 'suspendido.test.local' },
    update: { tenantId: tenantSuspendido.id, applicationId: dummyAppId, status: TenantStatus.SUSPENDED },
    create: {
      hostname: 'suspendido.test.local',
      tenantId: tenantSuspendido.id,
      applicationId: dummyAppId,
      isPrimary: true,
      status: TenantStatus.SUSPENDED,
    },
  });

  await prisma.license.upsert({
    where: { tenantId_applicationId: { tenantId: tenantSuspendido.id, applicationId: dummyAppId } },
    update: {
      status: LicenseStatus.SUSPENDED,
      startsAt: tenDaysAgo,
      expiresAt: oneDayAgo,
      gracePeriodDays: 0,
      suspensionReason: 'Suscripción no renovada. Factura vencida.',
      suspendedAt: now,
    },
    create: {
      licenseKey: 'LIC-SUSPENDIDO-2026-DEF',
      tenantId: tenantSuspendido.id,
      applicationId: dummyAppId,
      status: LicenseStatus.SUSPENDED,
      startsAt: tenDaysAgo,
      expiresAt: oneDayAgo,
      gracePeriodDays: 0,
      billingCycle: BillingCycle.MONTHLY,
      amount: 49.0,
      currency: 'USD',
      suspensionReason: 'Suscripción no renovada. Factura vencida.',
      suspendedAt: now,
    },
  });
  console.log('[Seed] Tenant Demo Suspendido configurado (suspendido.test.local)');

  console.log('--- Seed completado con éxito ---');
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
