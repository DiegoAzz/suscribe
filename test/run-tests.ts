import assert from 'node:assert';
import { buildApp } from '../src/server.js';
import { licenseCache } from '../src/cache/license-cache.js';

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 Iniciando Suite de Pruebas de AppzPlay License Gateway');
  console.log('🧪 ========================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err: unknown) {
      console.error(`  ❌ [FAIL] ${name}`);
      console.error('     Detalle:', (err as Error).message);
      failed++;
    }
  }

  // Inicializar servidor Fastify en memoria
  const app = await buildApp();
  await app.ready();

  // Test 1: Health Check
  await test('Health check endpoint responde 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.status, 'ok');
  });

  // Test 2: Bypass de Certificados SSL
  await test('Bypass de Sistema: /.well-known/acme-challenge devuelve 200 OK con cabecera BYPASS', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forward-auth/verify',
      headers: {
        'x-forwarded-host': 'cualquier-dominio-externo.com',
        'x-forwarded-uri': '/.well-known/acme-challenge/test-token',
        'x-forwarded-method': 'GET',
      },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['x-license-status'], 'BYPASS');
  });

  // Test 3: Bypass de Webhooks
  await test('Bypass de Sistema: /api/webhooks/stripe devuelve 200 OK independientemente del host', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forward-auth/verify',
      headers: {
        'x-forwarded-host': 'app-sin-registro.com',
        'x-forwarded-uri': '/api/webhooks/stripe',
        'x-forwarded-method': 'POST',
      },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['x-license-status'], 'BYPASS');
  });

  // Test 4: Dominio con Licencia ACTIVA -> 200 OK
  await test('Licencia ACTIVA: Traefik recibe 200 OK y cabeceras de autorización para reenviar al upstream', async () => {
    licenseCache.set('activo.appzplay.online', {
      allowed: true,
      statusCode: 200,
      tenantCode: 'cli_restaurante',
      appSlug: 'comidaya',
      headers: {
        'X-License-Status': 'ACTIVE',
        'X-License-Tenant': 'cli_restaurante',
        'X-License-App': 'comidaya',
      },
      cachedAt: Date.now(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forward-auth/verify',
      headers: {
        'x-forwarded-host': 'activo.appzplay.online',
        'x-forwarded-uri': '/pedidos',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['x-license-status'], 'ACTIVE');
    assert.strictEqual(res.headers['x-license-tenant'], 'cli_restaurante');
    assert.strictEqual(res.headers['x-license-app'], 'comidaya');
  });

  // Test 5: Dominio en Período de Gracia (PAST_DUE_IN_GRACE) -> 200 OK con Warning
  await test('Período de Gracia: Permite el acceso sin cortar el servicio al cliente pero añade aviso', async () => {
    licenseCache.set('gracia.appzplay.online', {
      allowed: true,
      statusCode: 200,
      tenantCode: 'cli_clinica',
      appSlug: 'turnoya',
      headers: {
        'X-License-Status': 'PAST_DUE_IN_GRACE',
        'X-License-Grace-Days-Left': '2',
      },
      cachedAt: Date.now(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forward-auth/verify',
      headers: {
        'x-forwarded-host': 'gracia.appzplay.online',
        'x-forwarded-uri': '/citas',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['x-license-status'], 'PAST_DUE_IN_GRACE');
    assert.strictEqual(res.headers['x-license-grace-days-left'], '2');
  });

  // Test 6: Dominio SUSPENDIDO en Navegador Web -> Redirección 302 a /suspended
  await test('Bloqueo Navegador: Dominio SUSPENDIDO redirige con código 302 a la pantalla de suspensión', async () => {
    licenseCache.set('bloqueado.appzplay.online', {
      allowed: false,
      statusCode: 403,
      reason: 'Factura vencida. Pago pendiente.',
      tenantCode: 'cli_bloqueado',
      cachedAt: Date.now(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forward-auth/verify',
      headers: {
        'x-forwarded-host': 'bloqueado.appzplay.online',
        'x-forwarded-uri': '/panel',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    assert.strictEqual(res.statusCode, 302);
    assert.ok(res.headers.location?.includes('/suspended'));
    assert.ok(res.headers.location?.includes('bloqueado.appzplay.online'));
  });

  // Test 7: Dominio SUSPENDIDO en Petición API -> 403 Forbidden JSON
  await test('Bloqueo API: Dominio SUSPENDIDO en llamadas API responde 403 JSON', async () => {
    licenseCache.set('api-bloqueada.appzplay.online', {
      allowed: false,
      statusCode: 403,
      reason: 'Suscripción inactiva.',
      tenantCode: 'cli_api',
      cachedAt: Date.now(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/forward-auth/verify',
      headers: {
        'x-forwarded-host': 'api-bloqueada.appzplay.online',
        'x-forwarded-uri': '/api/v1/users',
        accept: 'application/json',
      },
    });

    assert.strictEqual(res.statusCode, 403);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.status, 'SUSPENDED_OR_EXPIRED');
  });

  // Test 8: Vista Pública HTML /suspended preserva los datos
  await test('Vista Pública: /suspended certifica la no-destrucción de datos del cliente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/suspended?domain=autospa.appzplay.online&reason=Suscripcion%20vencida',
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('Tus datos están 100% seguros'));
    assert.ok(res.body.includes('autospa.appzplay.online'));
  });

  // Test 9: Invalidación Inmediata de Caché
  await test('Caché LRU: Invalidación instantánea al reactivar o suspender un dominio', async () => {
    licenseCache.set('reactivado.appzplay.online', {
      allowed: false,
      statusCode: 403,
      cachedAt: Date.now(),
    });
    assert.strictEqual(licenseCache.get('reactivado.appzplay.online')?.allowed, false);

    // Invalida inmediatamente
    licenseCache.invalidate('reactivado.appzplay.online');
    assert.strictEqual(licenseCache.get('reactivado.appzplay.online'), undefined);
  });

  // Test 10: Generador de Etiquetas Traefik para Coolify
  await test('Traefik Helper: Genera configuración con forwardauth.address y authResponseHeaders', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/traefik/labels-generator?serviceName=turnoya&domain=turnos.appzplay.online',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.snippet.includes('middlewares=appzplay-auth@docker'));
    assert.ok(body.snippet.includes('forwardauth.trustForwardHeader=true'));
    assert.ok(body.snippet.includes('authResponseHeaders=X-License-Status,X-License-Tenant,X-License-App'));
  });

  await app.close();

  console.log('\n========================================================');
  console.log(`🏁 Resumen de Pruebas: ${passed} pasadas, ${failed} fallidas`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
