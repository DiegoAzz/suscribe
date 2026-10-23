const API_BASE = '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('appzplay_token');
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Garantizar body válido en métodos mutantes para evitar FST_ERR_CTP_EMPTY_JSON_BODY
  let body = options.body;
  if ((options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH') && body === undefined) {
    body = JSON.stringify({});
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: 'Error en la petición' }));
    throw new Error(errorBody.error || `Error HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: any }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMe: () => request<{ user: any }>('/api/v1/auth/me'),
  logout: () =>
    request('/api/v1/auth/logout', {
      method: 'POST',
    }),

  // Metrics & Cache
  getMetrics: () => request<any>('/api/v1/dashboard/metrics'),
  purgeCache: () => request<any>('/api/v1/cache/purge', { method: 'POST' }),

  // Tenants
  getTenants: () => request<any[]>('/api/v1/tenants'),
  onboardTenant: (data: any) =>
    request<any>('/api/v1/tenants/onboard', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createTenant: (data: any) =>
    request('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteTenant: (id: string) =>
    request(`/api/v1/tenants/${id}`, {
      method: 'DELETE',
    }),

  // Applications
  getApplications: () => request<any[]>('/api/v1/applications'),
  createApplication: (data: any) =>
    request('/api/v1/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Domains
  getDomains: () => request<any[]>('/api/v1/domains'),
  createDomain: (data: any) =>
    request('/api/v1/domains', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteDomain: (id: string) =>
    request(`/api/v1/domains/${id}`, {
      method: 'DELETE',
    }),

  // Licenses & Quick Actions (1-Click)
  getLicenses: () => request<any[]>('/api/v1/licenses'),
  createLicense: (data: any) =>
    request('/api/v1/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  suspendLicense: (id: string, reason?: string) =>
    request<any>(`/api/v1/licenses/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  reactivateLicense: (id: string) =>
    request<any>(`/api/v1/licenses/${id}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  extendLicense: (id: string, days = 30) =>
    request<any>(`/api/v1/licenses/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),

  // Audit Logs
  getAuditLogs: (limit = 50) => request<any[]>(`/api/v1/audit/logs?limit=${limit}`),

  // Traefik Helper
  getTraefikSnippet: (serviceName: string, domain: string) =>
    request<any>(`/api/v1/traefik/labels-generator?serviceName=${encodeURIComponent(serviceName)}&domain=${encodeURIComponent(domain)}`),

  // Coolify Integration
  getCoolifyConfig: () => request<{ url: string; token: string; hasToken: boolean }>('/api/v1/coolify/config'),
  saveCoolifyConfig: (data: { url: string; token: string }) =>
    request<any>('/api/v1/coolify/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getCoolifyApps: () => request<{ success: boolean; count: number; apps: any[] }>('/api/v1/coolify/apps'),
  protectCoolifyApp: (uuid: string, appName?: string) =>
    request<any>('/api/v1/coolify/protect', {
      method: 'POST',
      body: JSON.stringify({ uuid, appName }),
    }),
  unprotectCoolifyApp: (uuid: string) =>
    request<any>('/api/v1/coolify/unprotect', {
      method: 'POST',
      body: JSON.stringify({ uuid }),
    }),

  // ForwardAuth Simulator / Tester
  testForwardAuth: async (domain: string, uri = '/', method = 'GET') => {
    const startTime = performance.now();
    try {
      const res = await fetch(`/api/v1/forward-auth/verify`, {
        method: 'GET',
        headers: {
          'X-Forwarded-Host': domain,
          'X-Forwarded-Uri': uri,
          'X-Forwarded-Method': method,
          Accept: 'application/json',
        },
      });
      const latency = Math.round(performance.now() - startTime);
      const text = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      return {
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries()),
        body: parsed,
        latencyMs: latency,
      };
    } catch (err: any) {
      return {
        status: 0,
        ok: false,
        headers: {},
        body: { error: err.message },
        latencyMs: Math.round(performance.now() - startTime),
      };
    }
  },
};
