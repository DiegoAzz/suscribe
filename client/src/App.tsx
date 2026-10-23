import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Globe,
  Users,
  KeyRound,
  Activity,
  Terminal,
  Copy,
  RefreshCw,
  LogOut,
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  ExternalLink,
  Sliders,
} from 'lucide-react';
import { api } from './api/client';

export function App() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('appzplay_token'));
  const [activeTab, setActiveTab] = useState<'dashboard' | 'licenses' | 'tenants' | 'audit' | 'simulator' | 'coolify'>('dashboard');

  // Login form
  const [loginEmail, setLoginEmail] = useState('admin@appzplay.online');
  const [loginPassword, setLoginPassword] = useState('AppzPlaySuperAdmin2026!');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Dashboard Data
  const [metrics, setMetrics] = useState<any>(null);
  const [licenses, setLicenses] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals & Forms
  const [suspendingLicenseId, setSuspendingLicenseId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('Suscripción suspendida manualmente por mora en el pago.');
  const [showNewTenantModal, setShowNewTenantModal] = useState(false);
  const [newTenantCode, setNewTenantCode] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantDomain, setNewTenantDomain] = useState('');
  const [newTenantAppId, setNewTenantAppId] = useState('');
  const [customAppName, setCustomAppName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [newTenantDays, setNewTenantDays] = useState(30);
  const [onboardLoading, setOnboardLoading] = useState(false);

  // Simulator
  const [simDomain, setSimDomain] = useState('demo.appzplay.online');
  const [simUri, setSimUri] = useState('/');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Coolify Helper
  const [selectedAppSlug, setSelectedAppSlug] = useState('turnoya');
  const [helperDomain, setHelperDomain] = useState('turnos.appzplay.online');
  const [helperSnippet, setHelperSnippet] = useState('');
  const [coolifyUiSnippet, setCoolifyUiSnippet] = useState('');
  const [snippetFormat, setSnippetFormat] = useState<'ui' | 'compose'>('ui');

  const showNotify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Check auth
  useEffect(() => {
    if (token) {
      api.getMe()
        .then((res) => setUser(res.user))
        .catch(() => {
          localStorage.removeItem('appzplay_token');
          setToken(null);
          setUser(null);
        });
    }
  }, [token]);

  // Load data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [m, lic, ten, dom, apps, logs] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getLicenses().catch(() => []),
        api.getTenants().catch(() => []),
        api.getDomains().catch(() => []),
        api.getApplications().catch(() => []),
        api.getAuditLogs(30).catch(() => []),
      ]);
      setMetrics(m);
      setLicenses(lic || []);
      setTenants(ten || []);
      setDomains(dom || []);
      setApplications(apps || []);
      setAuditLogs(logs || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadAllData();
      const interval = setInterval(loadAllData, 15000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Update snippet when app/domain changes
  useEffect(() => {
    api.getTraefikSnippet(selectedAppSlug, helperDomain)
      .then((res) => {
        setHelperSnippet(res.snippet);
        setCoolifyUiSnippet(res.coolifyUiSnippet || '');
      })
      .catch(() => {});
  }, [selectedAppSlug, helperDomain]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await api.login({ email: loginEmail, password: loginPassword });
      localStorage.setItem('appzplay_token', res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout().finally(() => {
      localStorage.removeItem('appzplay_token');
      setToken(null);
      setUser(null);
    });
  };

  const handlePurgeCache = async () => {
    try {
      const res = await api.purgeCache();
      showNotify(`Caché purgada exitosamente (${res.keysPurged} claves eliminadas)`);
      loadAllData();
    } catch (err: any) {
      showNotify(err.message, 'error');
    }
  };

  // 1-Click License Actions
  const handleSuspend = async () => {
    if (!suspendingLicenseId) return;
    try {
      const res = await api.suspendLicense(suspendingLicenseId, suspendReason);
      showNotify(`Licencia suspendida exitosamente. Dominios afectados: ${res.domainsAffected?.join(', ') || 'N/A'}`);
      setSuspendingLicenseId(null);
      loadAllData();
    } catch (err: any) {
      showNotify(err.message, 'error');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      const res = await api.reactivateLicense(id);
      showNotify(`Licencia reactivada exitosamente. Dominios desbloqueados: ${res.domainsAffected?.join(', ') || 'N/A'}`);
      loadAllData();
    } catch (err: any) {
      showNotify(err.message, 'error');
    }
  };

  const handleExtend = async (id: string, days = 30) => {
    try {
      const res = await api.extendLicense(id, days);
      showNotify(res.message);
      loadAllData();
    } catch (err: any) {
      showNotify(err.message, 'error');
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const appId = newTenantAppId === '__NEW__' ? (customAppName.trim() || 'Nueva App') : (newTenantAppId || applications[0]?.id);
    if (!newTenantName || !newTenantCode || !newTenantDomain || !appId) {
      showNotify('Por favor completa todos los campos requeridos (*)', 'error');
      return;
    }

    setOnboardLoading(true);
    try {
      const res = await api.onboardTenant({
        businessName: newTenantName,
        code: newTenantCode,
        hostname: newTenantDomain,
        applicationId: appId,
        email: newTenantEmail,
        phone: newTenantPhone,
        daysActive: Number(newTenantDays) || 30,
      });

      showNotify(res.message || 'Cliente registrado exitosamente');
      setShowNewTenantModal(false);
      setNewTenantName('');
      setNewTenantCode('');
      setNewTenantDomain('');
      setNewTenantEmail('');
      setNewTenantPhone('');
      loadAllData();
    } catch (err: any) {
      showNotify(err.message, 'error');
    } finally {
      setOnboardLoading(false);
    }
  };

  const handleRunSimulator = async () => {
    setSimLoading(true);
    try {
      const res = await api.testForwardAuth(simDomain, simUri);
      setSimResult(res);
    } catch (err: any) {
      setSimResult({ error: err.message });
    } finally {
      setSimLoading(false);
    }
  };

  // Login View
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">AppzPlay</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                License Gateway
              </span>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-slate-200 text-center mb-1">Panel de Control Central</h2>
          <p className="text-xs text-slate-400 text-center mb-6">Ingresa para administrar licencias y control de Traefik</p>

          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Correo Electrónico</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {loginLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              <span>{loginLoading ? 'Verificando...' : 'Acceder al Gateway'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
            <span className="text-[11px] text-slate-500">Credenciales por defecto precargadas para pruebas</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium flex items-center gap-2 animate-bounce ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/90 border-red-500/40 text-red-200'
          }`}
        >
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm tracking-tight">AppzPlay</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  License Gateway
                </span>
              </div>
              <span className="text-[11px] text-slate-400">Traefik ForwardAuth Proxy Controller</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4 bg-slate-950/60 p-1 rounded-xl border border-slate-800/60">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Métricas</span>
            </button>
            <button
              onClick={() => setActiveTab('licenses')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'licenses' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Licencias (1-Clic)</span>
            </button>
            <button
              onClick={() => setActiveTab('tenants')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'tenants' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Clientes & Dominios</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Inspector en Vivo</span>
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'simulator' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>Sandbox / Test</span>
            </button>
            <button
              onClick={() => setActiveTab('coolify')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'coolify' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Generador Coolify</span>
            </button>
          </nav>
        </div>

        {/* User & Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePurgeCache}
            title="Vaciar caché de ForwardAuth"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 border border-slate-700/60 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Purgar Caché</span>
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-200">{user.fullName}</div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Conectado
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800/80 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* TAB 1: DASHBOARD METRICS */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Clientes Monitoreados</span>
                  <Users className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-2xl font-bold text-white">{metrics?.tenants?.total ?? tenants.length}</div>
                <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{metrics?.tenants?.active ?? tenants.length} Activos en el sistema</span>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Dominios Registrados</span>
                  <Globe className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-2xl font-bold text-white">{metrics?.domains?.total ?? domains.length}</div>
                <div className="text-xs text-sky-400 mt-1 flex items-center gap-1">
                  <span>Protegidos bajo Traefik ForwardAuth</span>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Licencias Activas</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">{metrics?.licenses?.active ?? licenses.filter(l => l.status === 'ACTIVE').length}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <span>De un total de {metrics?.licenses?.total ?? licenses.length} registradas</span>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 backdrop-blur">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Peticiones Interceptadas</span>
                  <Activity className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">{metrics?.traffic?.totalRequests ?? auditLogs.length}</div>
                <div className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                  <span>{metrics?.traffic?.denied ?? auditLogs.filter(a => a.decision === 'DENY').length} accesos bloqueados</span>
                </div>
              </div>
            </div>

            {/* Quick Overview Table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Estado Inmediato de Licencias</h3>
                  <p className="text-xs text-slate-400">Control en tiempo real de acceso a las aplicaciones del VPS</p>
                </div>
                <button
                  onClick={() => setActiveTab('licenses')}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                >
                  <span>Ver todas y gestionar</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-semibold">Cliente / Razón Social</th>
                      <th className="pb-3 font-semibold">Aplicación</th>
                      <th className="pb-3 font-semibold">Dominio(s)</th>
                      <th className="pb-3 font-semibold">Estado</th>
                      <th className="pb-3 font-semibold">Vencimiento</th>
                      <th className="pb-3 font-semibold text-right">Acción Rápida (1-Clic)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {licenses.slice(0, 5).map((lic) => {
                      const isExpired = new Date() > new Date(lic.expiresAt);
                      const isSuspended = lic.status === 'SUSPENDED';
                      return (
                        <tr key={lic.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 font-medium text-white">{lic.tenant?.businessName}</td>
                          <td className="py-3 text-slate-300">{lic.application?.name}</td>
                          <td className="py-3 text-slate-400 font-mono text-[11px]">
                            {lic.tenant?.domains?.map((d: any) => d.hostname).join(', ') || 'Sin dominio'}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase border ${
                                isSuspended
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : lic.status === 'PAST_DUE'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : isExpired
                                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {lic.status}
                            </span>
                          </td>
                          <td className="py-3 text-slate-400">
                            {new Date(lic.expiresAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 text-right">
                            {isSuspended ? (
                              <button
                                onClick={() => handleReactivate(lic.id)}
                                className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold text-[11px] transition-colors"
                              >
                                Reactivar
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSuspendingLicenseId(lic.id);
                                  setSuspendReason('Suscripción suspendida manualmente.');
                                }}
                                className="px-2.5 py-1 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-semibold text-[11px] transition-colors"
                              >
                                Suspender
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GESTIÓN DE LICENCIAS CON ACCIONES DE 1-CLIC */}
        {activeTab === 'licenses' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Panel de Control de Licencias</h2>
                <p className="text-xs text-slate-400">
                  Suspende o reactiva el acceso de cualquier cliente con 1 clic sin tocar sus bases de datos
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadAllData}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {licenses.map((lic) => {
                const isSuspended = lic.status === 'SUSPENDED';
                const isPastDue = lic.status === 'PAST_DUE';
                const expiresDate = new Date(lic.expiresAt);
                const isExpired = new Date() > expiresDate;

                return (
                  <div
                    key={lic.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isSuspended
                        ? 'bg-red-950/20 border-red-900/50 hover:border-red-700/60'
                        : isPastDue
                        ? 'bg-amber-950/20 border-amber-900/50 hover:border-amber-700/60'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Left: Info */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base text-white">{lic.tenant?.businessName}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {lic.tenant?.code}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                              isSuspended
                                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                : isPastDue
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {lic.status}
                          </span>
                        </div>

                        <div className="text-xs text-slate-300 flex items-center gap-4 flex-wrap">
                          <span>
                            Aplicación: <strong className="text-indigo-400">{lic.application?.name}</strong>
                          </span>
                          <span>
                            Vencimiento:{' '}
                            <strong className={isExpired ? 'text-red-400' : 'text-slate-200'}>
                              {expiresDate.toLocaleDateString()}
                            </strong>
                          </span>
                          <span>
                            Días de gracia configurados: <strong>{lic.gracePeriodDays} días</strong>
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>
                            Dominios protegidos:{' '}
                            {lic.tenant?.domains?.map((d: any) => d.hostname).join(', ') || 'Ninguno vinculado'}
                          </span>
                        </div>

                        {lic.suspensionReason && (
                          <div className="text-xs text-red-300 bg-red-950/40 border border-red-900/60 p-2 rounded-lg mt-2">
                            <strong>Motivo de suspensión:</strong> {lic.suspensionReason}
                          </div>
                        )}
                      </div>

                      {/* Right: 1-Click Quick Actions */}
                      <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                        {isSuspended ? (
                          <button
                            onClick={() => handleReactivate(lic.id)}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-600/20"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>Reactivar Servicio (1-Clic)</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSuspendingLicenseId(lic.id);
                              setSuspendReason('Suscripción suspendida manualmente por mora en el pago.');
                            }}
                            className="px-4 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            <span>Suspender Acceso (1-Clic)</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleExtend(lic.id, 30)}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700/80 transition-colors"
                        >
                          <Clock className="w-4 h-4 text-indigo-400" />
                          <span>+30 Días</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CLIENTES & DOMINIOS */}
        {activeTab === 'tenants' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Inquilinos y Asignación de Dominios</h2>
                <p className="text-xs text-slate-400">Gestiona los clientes SaaS y los hostnames que tienen asignados</p>
              </div>
              <button
                onClick={() => setShowNewTenantModal(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Cliente</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tenants.map((t) => (
                <div key={t.id} className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">{t.businessName}</h4>
                      <span className="text-[11px] font-mono text-indigo-400">{t.code}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        t.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1">
                    <div>Contacto: <span className="text-slate-200">{t.contactName || 'N/A'}</span></div>
                    <div>Email: <span className="text-slate-200">{t.email || 'N/A'}</span></div>
                    <div>Teléfono: <span className="text-slate-200">{t.phone || 'N/A'}</span></div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 block mb-1.5 font-semibold">Dominios asignados:</span>
                    <div className="flex flex-wrap gap-1">
                      {t.domains && t.domains.length > 0 ? (
                        t.domains.map((d: any) => (
                          <span
                            key={d.id}
                            className="px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono text-[10px] border border-slate-700/60"
                          >
                            {d.hostname}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Sin dominios</span>
                      )}
                    </div>
                  </div>

                  {t.licenses && t.licenses.length > 0 && (
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-medium">Control de Acceso:</span>
                      {t.licenses[0].status === 'SUSPENDED' ? (
                        <button
                          onClick={() => handleReactivate(t.licenses[0].id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 font-semibold text-xs transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Reactivar Acceso</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSuspendingLicenseId(t.licenses[0].id);
                            setSuspendReason('Suscripción suspendida manualmente.');
                          }}
                          className="px-3 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 font-semibold text-xs transition-colors flex items-center gap-1 shadow-sm"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Suspender Acceso</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: INSPECTOR EN VIVO */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Inspector de Peticiones en Vivo (ForwardAuth)</h2>
                <p className="text-xs text-slate-400">
                  Visualiza cada consulta de autorización enviada por Traefik en tiempo real con su veredicto y latencia
                </p>
              </div>
              <button
                onClick={loadAllData}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refrescar Logs</span>
              </button>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-semibold">Hora</th>
                      <th className="pb-3 font-semibold">Dominio</th>
                      <th className="pb-3 font-semibold">Ruta (URI)</th>
                      <th className="pb-3 font-semibold">Método</th>
                      <th className="pb-3 font-semibold">Decisión</th>
                      <th className="pb-3 font-semibold">Latencia</th>
                      <th className="pb-3 font-semibold">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 text-slate-400">{new Date(log.createdAt).toLocaleTimeString()}</td>
                        <td className="py-2.5 font-mono text-sky-400">{log.domain}</td>
                        <td className="py-2.5 font-mono text-slate-300">{log.path}</td>
                        <td className="py-2.5 font-semibold text-slate-300">{log.method}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                              log.decision === 'ALLOW'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : log.decision === 'BYPASS'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {log.decision}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-400">{log.latencyMs}ms</td>
                        <td className="py-2.5 text-slate-400 max-w-xs truncate">{log.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SIMULADOR / SANDBOX */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Sandbox de Verificación Traefik</h2>
              <p className="text-xs text-slate-400">
                Prueba en tiempo real cómo respondería el Gateway ante cualquier petición simulada desde Traefik
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Simulator Input */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Parámetros de la Petición Simulada</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Dominio (X-Forwarded-Host)</label>
                  <input
                    type="text"
                    value={simDomain}
                    onChange={(e) => setSimDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="ej: demo.appzplay.online"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setSimDomain('activo.test.local')}
                      className="text-[11px] text-indigo-400 hover:underline"
                    >
                      Probar Activo
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => setSimDomain('gracia.test.local')}
                      className="text-[11px] text-amber-400 hover:underline"
                    >
                      Probar En Gracia
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => setSimDomain('suspendido.test.local')}
                      className="text-[11px] text-red-400 hover:underline"
                    >
                      Probar Suspendido
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Ruta Solicitada (X-Forwarded-Uri)</label>
                  <input
                    type="text"
                    value={simUri}
                    onChange={(e) => setSimUri(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="/ o /api/webhooks/stripe"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRunSimulator}
                  disabled={simLoading}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
                >
                  {simLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  <span>Ejecutar Verificación ForwardAuth</span>
                </button>
              </div>

              {/* Simulator Output */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Respuesta del Gateway</h3>

                {simResult ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">Código HTTP:</span>
                      <span
                        className={`px-3 py-1 rounded-lg font-bold text-xs uppercase border ${
                          simResult.status === 200
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : simResult.status === 302
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-red-500/15 text-red-400 border-red-500/30'
                        }`}
                      >
                        {simResult.status} {simResult.status === 200 ? 'OK (Permitido)' : simResult.status === 302 ? 'Redirect (Suspendido)' : 'Forbidden (Bloqueado)'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">({simResult.latencyMs}ms)</span>
                    </div>

                    <div>
                      <span className="text-xs text-slate-400 block mb-1">Cabeceras Inyectadas para Traefik:</span>
                      <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono overflow-x-auto">
                        {JSON.stringify(simResult.headers, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="text-xs text-slate-400 block mb-1">Cuerpo de Respuesta:</span>
                      <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono overflow-x-auto">
                        {typeof simResult.body === 'object' ? JSON.stringify(simResult.body, null, 2) : simResult.body}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    Ejecuta una prueba para inspeccionar el flujo
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: GENERADOR COOLIFY */}
        {activeTab === 'coolify' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Generador de Etiquetas Traefik para Coolify</h2>
              <p className="text-xs text-slate-400">
                Copia y pega estas etiquetas en cualquier servicio Docker Compose de Coolify para protegerlo con el Gateway
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form */}
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Configuración del Servicio</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Aplicación</label>
                  <select
                    value={selectedAppSlug}
                    onChange={(e) => setSelectedAppSlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {applications.map((app) => (
                      <option key={app.id} value={app.slug}>
                        {app.name} ({app.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Dominio Público de la App</label>
                  <input
                    type="text"
                    value={helperDomain}
                    onChange={(e) => setHelperDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                    placeholder="ej: turnos.appzplay.online"
                  />
                </div>

                <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/40 text-xs text-indigo-300 space-y-2">
                  <div className="font-semibold flex items-center gap-1.5 text-indigo-200">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <span>Sin Modificar el VPS Global</span>
                  </div>
                  <p>
                    Estas etiquetas se agregan únicamente al contenedor que deseas proteger. No alteran ni reinician el proxy global de Coolify.
                  </p>
                </div>
              </div>

              {/* Code Snippet */}
              <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setSnippetFormat('ui')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        snippetFormat === 'ui' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Formato Coolify UI (Active Labels)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSnippetFormat('compose')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        snippetFormat === 'compose' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Formato Docker Compose (YAML)
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      const textToCopy = snippetFormat === 'ui' ? coolifyUiSnippet : helperSnippet;
                      navigator.clipboard.writeText(textToCopy);
                      showNotify('Etiquetas copiadas al portapapeles');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar al Portapapeles</span>
                  </button>
                </div>

                {snippetFormat === 'ui' ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                      <div className="font-semibold text-indigo-400">Instrucciones para la pantalla de Coolify:</div>
                      <div>1. En Coolify, busca la línea que dice <code>.middlewares=gzip</code> y agrégale <code>,appzplay-auth</code> al final.</div>
                      <div>2. Pega estas 3 líneas al final de la caja <strong>Active labels</strong>:</div>
                    </div>
                    <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                      {coolifyUiSnippet}
                    </pre>
                  </div>
                ) : (
                  <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto leading-relaxed">
                    {helperSnippet}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Suspender Licencia */}
      {suspendingLicenseId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirmar Suspensión Inmediata</h3>
                <span className="text-xs text-slate-400">El acceso HTTP será bloqueado en tiempo real</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Motivo visible para el cliente</label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-[11px] text-emerald-300">
              🔒 <strong>Garantía no destructiva:</strong> La base de datos y los datos del cliente se mantienen 100% seguros y no se alteran.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSuspendingLicenseId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSuspend}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-red-600/20"
              >
                Suspender Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Nuevo Cliente y Dominio */}
      {showNewTenantModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Registrar Nuevo Sitio / Cliente</h3>
                  <span className="text-xs text-slate-400">Alta de tenant, vinculación de dominio y licencia en 1 paso</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewTenantModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Razón Social / Negocio *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: Pizzería Nápoles"
                    value={newTenantName}
                    onChange={(e) => {
                      setNewTenantName(e.target.value);
                      if (!newTenantCode) {
                        setNewTenantCode('cli-' + e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20));
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Código de Cliente *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: cli-napoles"
                    value={newTenantCode}
                    onChange={(e) => setNewTenantCode(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Aplicación SaaS *</label>
                  <select
                    value={newTenantAppId || (applications[0]?.id ?? '')}
                    onChange={(e) => setNewTenantAppId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    {applications.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.slug})
                      </option>
                    ))}
                    <option value="__NEW__">➕ + Crear Nueva Aplicación...</option>
                  </select>
                  {newTenantAppId === '__NEW__' && (
                    <input
                      type="text"
                      required
                      placeholder="Nombre de la nueva aplicación (ej: Godot)"
                      value={customAppName}
                      onChange={(e) => setCustomAppName(e.target.value)}
                      className="w-full mt-2 px-3 py-2 rounded-lg bg-slate-950 border border-indigo-500 text-white text-xs focus:outline-none animate-fadeIn"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Dominio o Subdominio *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej: pedidos.napoles.online"
                    value={newTenantDomain}
                    onChange={(e) => setNewTenantDomain(e.target.value.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase().trim())}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Vigencia Inicial (Días)</label>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={newTenantDays}
                    onChange={(e) => setNewTenantDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email de Contacto</label>
                  <input
                    type="email"
                    placeholder="contacto@cliente.com"
                    value={newTenantEmail}
                    onChange={(e) => setNewTenantEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Teléfono</label>
                  <input
                    type="text"
                    placeholder="+57 300 000 0000"
                    value={newTenantPhone}
                    onChange={(e) => setNewTenantPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/50 text-[11px] text-indigo-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-400" />
                <span>Al registrar, el dominio quedará inmediatamente protegido bajo Traefik ForwardAuth con licencia activa.</span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewTenantModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={onboardLoading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                >
                  {onboardLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{onboardLoading ? 'Registrando...' : 'Registrar y Proteger Sitio'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
