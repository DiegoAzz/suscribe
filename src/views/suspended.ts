export function renderSuspendedPage(params: {
  domain?: string;
  reason?: string;
  uri?: string;
}): string {
  const rawDomain = params.domain || '';
  const domain = rawDomain ? escapeHtml(rawDomain) : 'este servicio';
  const reason = params.reason
    ? escapeHtml(params.reason)
    : 'La suscripción asociada a este dominio se encuentra temporalmente inactiva o vencida.';
  const uri = params.uri && params.uri !== '/suspended' ? params.uri : '/';
  const targetUrl = rawDomain ? `https://${rawDomain}${uri}` : '/';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Servicio Temporalmente Suspendido — AppzPlay</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e1b4b 100%);
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      max-width: 580px;
      width: 100%;
      padding: 2.5rem;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.15);
      text-align: center;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.9rem;
      border-radius: 9999px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      font-size: 0.825rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
      letter-spacing: 0.025em;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
    }
    .icon-wrapper {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(168, 85, 247, 0.2));
      border: 1px solid rgba(255, 255, 255, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      color: #f87171;
    }
    h1 {
      font-size: 1.65rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 0.75rem;
      letter-spacing: -0.02em;
    }
    .domain-tag {
      display: inline-block;
      font-family: monospace;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #93c5fd;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      font-size: 0.95rem;
      margin-bottom: 1rem;
      word-break: break-all;
    }
    p {
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 1.25rem;
    }
    .reason-box {
      background: rgba(15, 23, 42, 0.6);
      border-left: 3px solid #f59e0b;
      padding: 0.85rem 1rem;
      border-radius: 8px;
      text-align: left;
      font-size: 0.875rem;
      color: #cbd5e1;
      margin-bottom: 1.5rem;
    }
    .reason-title {
      font-weight: 600;
      color: #fbbf24;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }
    .data-safe-notice {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 10px;
      padding: 0.85rem;
      font-size: 0.825rem;
      color: #6ee7b7;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-align: left;
      margin-bottom: 1.75rem;
    }
    .data-safe-notice svg {
      flex-shrink: 0;
    }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      color: #ffffff;
      padding: 0.85rem 1.5rem;
      border-radius: 10px;
      font-weight: 600;
      text-decoration: none;
      font-size: 0.95rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px 0 rgba(79, 70, 229, 0.35);
      border: none;
      cursor: pointer;
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
      padding: 0.85rem 1.25rem;
      border-radius: 10px;
      font-weight: 600;
      text-decoration: none;
      font-size: 0.9rem;
      border: 1px solid rgba(255, 255, 255, 0.12);
      transition: all 0.2s ease;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-family: inherit;
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.25);
    }
    .btn-secondary:active {
      transform: scale(0.98);
    }
    .verify-status {
      display: none;
      margin-top: 1rem;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      font-size: 0.85rem;
      text-align: left;
      line-height: 1.5;
      animation: fadeIn 0.25s ease-out;
    }
    .verify-status.error {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .verify-status.success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #6ee7b7;
    }
    .direct-link-container {
      margin-top: 1.25rem;
    }
    .direct-link {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: #94a3b8;
      font-size: 0.8rem;
      text-decoration: none;
      transition: color 0.2s;
    }
    .direct-link:hover {
      color: #38bdf8;
      text-decoration: underline;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .spin {
      animation: spin 0.8s linear infinite;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    footer {
      margin-top: 1.75rem;
      font-size: 0.75rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <span class="badge-dot"></span>
      <span>ACCESO TEMPORALMENTE PAUSADO</span>
    </div>

    <div class="icon-wrapper">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
    </div>

    <h1>Suscripción No Disponible</h1>
    <div class="domain-tag">${domain}</div>

    <p>El acceso a este sistema ha sido restringido por la pasarela de licencias de <strong>AppzPlay</strong> debido al estado actual de su cuenta.</p>

    <div class="reason-box">
      <div class="reason-title">Motivo reportado:</div>
      <div>${reason}</div>
    </div>

    <div class="data-safe-notice">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        <polyline points="9 12 11 14 15 10"></polyline>
      </svg>
      <div>
        <strong>Tus datos están 100% seguros:</strong> La información, configuraciones y registros de tu aplicación no han sido modificados ni borrados. El acceso se restablecerá de inmediato al reactivar la suscripción.
      </div>
    </div>

    <div class="btn-group">
      <a href="mailto:soporte@appzplay.online?subject=Reactivacion%20de%20Servicio%20-%20${encodeURIComponent(domain)}" class="btn-primary">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="4" width="20" height="16" rx="2"></rect>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L1 7"></path>
        </svg>
        Contactar a Soporte y Renovar
      </a>
      <button type="button" id="btn-verify" class="btn-secondary" onclick="verificarLicencia()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6"></path>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>Verificar de Nuevo</span>
      </button>
    </div>

    <div id="verify-status" class="verify-status"></div>

    ${rawDomain ? `
    <div class="direct-link-container">
      <a href="${escapeHtml(targetUrl)}" class="direct-link">
        Reintentar abrir <strong>https://${escapeHtml(rawDomain)}</strong> &rarr;
      </a>
    </div>` : ''}

    <footer>
      AppzPlay License Gateway • Control Perimetral con Traefik
    </footer>
  </div>

  <script>
    async function verificarLicencia() {
      const btn = document.getElementById('btn-verify');
      const statusBox = document.getElementById('verify-status');
      const domain = ${JSON.stringify(rawDomain)};
      const targetUrl = ${JSON.stringify(targetUrl)};

      if (!btn) return;
      btn.disabled = true;
      btn.style.opacity = '0.75';
      btn.style.cursor = 'wait';
      btn.innerHTML = \`
        <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <span>Comprobando estado en tiempo real...</span>
      \`;

      if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.className = 'verify-status';
      }

      try {
        if (!domain) {
          window.location.reload();
          return;
        }

        const res = await fetch('/api/v1/forward-auth/verify?domain=' + encodeURIComponent(domain), {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store'
        });

        if (res.status === 200) {
          btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          btn.style.borderColor = '#10b981';
          btn.style.color = '#ffffff';
          btn.innerHTML = \`
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>¡Suscripción Activa! Redirigiendo...</span>
          \`;
          if (statusBox) {
            statusBox.className = 'verify-status success';
            statusBox.style.display = 'block';
            statusBox.innerHTML = '<strong>✅ ¡Licencia activa!</strong> Redirigiendo a tu aplicación en un instante...';
          }
          setTimeout(() => {
            window.location.href = targetUrl;
          }, 1000);
          return;
        }

        // Si la respuesta es 403 o continúa pausada
        const data = await res.json().catch(() => ({}));
        if (statusBox) {
          statusBox.className = 'verify-status error';
          statusBox.style.display = 'block';
          const reasonMsg = data.reason || 'El estado de la cuenta aún no ha sido restablecido por administración.';
          statusBox.innerHTML = '<strong>⚠️ Suscripción aún pausada:</strong> ' + escapeHtmlClient(reasonMsg);
        }
      } catch (err) {
        // En caso de cualquier error de red, intentar navegar al destino
        if (targetUrl) {
          window.location.href = targetUrl;
        } else {
          window.location.reload();
        }
        return;
      } finally {
        setTimeout(() => {
          if (!btn.innerHTML.includes('¡Suscripción Activa!')) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.innerHTML = \`
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Verificar de Nuevo</span>
            \`;
          }
        }, 1200);
      }
    }

    function escapeHtmlClient(str) {
      const p = document.createElement('p');
      p.textContent = str;
      return p.innerHTML;
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
