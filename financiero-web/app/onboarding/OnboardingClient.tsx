"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type AccountStatus = {
  success: boolean;
  configured?: boolean;
  profileScoped?: boolean;
  profileId?: string | null;
  profile?: {
    id: string;
    email?: string | null;
    full_name?: string | null;
    monthly_income_target?: number | string | null;
  } | null;
  telegramAccounts?: Array<{ id: string; chat_id: string; username?: string | null }>;
  gmailIntegrations?: Array<{ id: string; email: string; status: string; oauthConnected?: boolean; connected_at?: string | null }>;
  bankConnections?: Array<{ id: string; provider: string; institution_name?: string | null; status: string; last_sync_at?: string | null }>;
  financialCounts?: Record<string, number>;
  error?: string;
  errors?: string[];
};

type BankProvider = {
  id: string;
  name: string;
  regions: string[];
  configured: boolean;
  status: string;
  missingEnvVars: string[];
  notes: string;
};

type BankCountryCode = 'MX' | 'US' | 'CO' | 'BR' | 'CL' | 'PE' | 'AR' | 'OTHER';

type BankCountryOption = {
  code: BankCountryCode;
  label: string;
  providerPreference: string[];
  banks: string[];
};

type PlaidHandler = {
  open: () => void;
  exit: () => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (options: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { institution_id?: string; name?: string } }) => void;
        onExit?: (error: { error_message?: string } | null) => void;
      }) => PlaidHandler;
    };
  }
}

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0,
});

const bankCountryOptions: BankCountryOption[] = [
  { code: 'MX', label: 'Mexico', providerPreference: ['prometeo', 'finerio', 'belvo'], banks: ['BBVA', 'Santander', 'Banorte', 'Citibanamex', 'HSBC', 'Nu', 'Otro banco'] },
  { code: 'US', label: 'Estados Unidos', providerPreference: ['plaid'], banks: ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'Capital One', 'Otro banco'] },
  { code: 'CO', label: 'Colombia', providerPreference: ['prometeo', 'belvo'], banks: ['Bancolombia', 'Davivienda', 'BBVA', 'Banco de Bogota', 'Otro banco'] },
  { code: 'BR', label: 'Brasil', providerPreference: ['belvo', 'prometeo'], banks: ['Itau', 'Bradesco', 'Nubank', 'Banco do Brasil', 'Otro banco'] },
  { code: 'CL', label: 'Chile', providerPreference: ['prometeo'], banks: ['Banco de Chile', 'Santander', 'BCI', 'Scotiabank', 'Otro banco'] },
  { code: 'PE', label: 'Peru', providerPreference: ['prometeo'], banks: ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'Otro banco'] },
  { code: 'AR', label: 'Argentina', providerPreference: ['prometeo'], banks: ['Galicia', 'Santander', 'BBVA', 'Macro', 'Otro banco'] },
  { code: 'OTHER', label: 'Otro pais', providerPreference: ['prometeo'], banks: ['Otro banco'] },
];

function formatCurrency(value: number) {
  return `$${currencyFormatter.format(value)} MXN`;
}

function parseMoney(value: string) {
  const numeric = Number(value.replace(/[,$\s]/g, ''));

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function statusTone(done: boolean) {
  return done
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
}

export default function OnboardingClient() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [bankProviders, setBankProviders] = useState<BankProvider[]>([]);
  const [bankCountry, setBankCountry] = useState<BankCountryCode>('MX');
  const [bankName, setBankName] = useState('Santander');
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [connectingPlaid, setConnectingPlaid] = useState(false);
  const [syncingBank, setSyncingBank] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [fullName, setFullName] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState('60000');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramExpiresAt, setTelegramExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fetchWithSessionRefresh = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);

    if (response.status !== 401) return response;

    const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' });

    if (!refreshResponse.ok) return response;

    return fetch(input, init);
  }, []);

  const refreshStatus = useCallback(async ({ keepFeedback = false }: { keepFeedback?: boolean } = {}) => {
    setLoading(true);
    if (!keepFeedback) setError('');

    try {
      const response = await fetchWithSessionRefresh('/api/account/status', { cache: 'no-store' });
      const data = (await response.json()) as AccountStatus;

      if (!response.ok || !data.success) {
        setError(data.error || data.errors?.join(' · ') || 'No pude leer el estado de tu cuenta.');
      }

      setStatus(data);
      setFullName(data.profile?.full_name || '');
      setMonthlyTarget(String(data.profile?.monthly_income_target || 60000));

      if (data.profileScoped) {
        const providersResponse = await fetchWithSessionRefresh('/api/bank/providers', { cache: 'no-store' });
        const providersData = await providersResponse.json();

        if (providersResponse.ok && providersData.success) {
          setBankProviders(providersData.providers || []);
        }
      }
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, [fetchWithSessionRefresh]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      const routeError = params.get('error');

      if (routeError) setError(decodeURIComponent(routeError));
      if (params.get('gmail') === 'connected') setMessage('Gmail/Banco conectado con Google.');
      void refreshStatus({ keepFeedback: Boolean(routeError || params.get('gmail')) });
    });
  }, [refreshStatus]);

  const monthlyTargetNumber = parseMoney(monthlyTarget);
  const third = monthlyTargetNumber / 3;
  const hasProfile = Boolean(status?.profileScoped && status.profile?.id);
  const hasInitialBudget = Boolean((status?.financialCounts?.presupuestos_mensuales || 0) > 0);
  const hasTelegram = Boolean((status?.telegramAccounts || []).length > 0);
  const activeGmailIntegrations = (status?.gmailIntegrations || []).filter((integration) => integration.status === 'active');
  const activeBankConnections = (status?.bankConnections || []).filter((connection) => connection.status === 'active');
  const hasGmail = activeGmailIntegrations.length > 0;
  const hasGmailOAuth = activeGmailIntegrations.some((integration) => integration.oauthConnected);
  const hasBankConnection = activeBankConnections.length > 0;
  const hasBankFallback = hasBankConnection || hasGmail;
  const selectedBankCountry = bankCountryOptions.find((country) => country.code === bankCountry) || bankCountryOptions[0];
  const selectedCountryProvider = selectedBankCountry.providerPreference
    .map((providerId) => bankProviders.find((provider) => provider.id === providerId))
    .find(Boolean);
  const canConnectSelectedCountry = selectedCountryProvider?.id === 'plaid' && selectedCountryProvider.configured;
  const selectedCountryStatus = selectedCountryProvider
    ? canConnectSelectedCountry
      ? 'Listo para conectar'
      : `${selectedCountryProvider.name} es la ruta recomendada; falta activar el flujo de conexion para este pais`
    : 'Aun no disponible para este pais';
  const checklist = useMemo(
    () => [
      { label: 'Cuenta creada', done: hasProfile },
      { label: 'Perfil automático', done: hasProfile && Boolean(status?.profile?.email) },
      { label: 'Presupuesto inicial', done: hasInitialBudget },
      { label: 'Telegram conectado', done: hasTelegram },
      { label: 'Banco conectado', done: hasBankFallback },
    ],
    [hasBankFallback, hasInitialBudget, hasProfile, hasTelegram, status?.profile?.email]
  );
  const completed = checklist.filter((item) => item.done).length;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setMessage('');

    try {
      const response = await fetchWithSessionRefresh('/api/account/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          monthlyIncomeTarget: monthlyTargetNumber,
          initializeBudget: true,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'No pude guardar tu configuración inicial.');
        return;
      }

      setMessage(data.budgetCreated ? 'Perfil guardado y presupuesto inicial creado.' : 'Perfil guardado. Tu presupuesto inicial ya existía.');
      await refreshStatus();
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function generateTelegramCode() {
    setLinkingTelegram(true);
    setError('');
    setMessage('');

    try {
      const response = await fetchWithSessionRefresh('/api/account/telegram-link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'No pude generar el código de Telegram.');
        return;
      }

      setTelegramCode(data.code);
      setTelegramDeepLink(data.deepLink || null);
      setTelegramExpiresAt(data.expiresAt || '');
      setMessage('Código listo. Envíalo al bot de Telegram para vincular tu cuenta.');
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setLinkingTelegram(false);
    }
  }

  function startGmailOAuth() {
    window.location.href = '/api/account/gmail/oauth/start';
  }

  function loadPlaidScript() {
    return new Promise<void>((resolve, reject) => {
      if (window.Plaid) {
        resolve();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"]');

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('No pude cargar la conexion bancaria.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No pude cargar la conexion bancaria.'));
      document.body.appendChild(script);
    });
  }

  async function connectPlaid() {
    setConnectingPlaid(true);
    setError('');
    setMessage('');

    try {
      const tokenResponse = await fetchWithSessionRefresh('/api/bank/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.success || !tokenData.linkToken) {
        setError('No pude iniciar la conexión bancaria. Intenta de nuevo en unos minutos.');
        return;
      }

      await loadPlaidScript();

      if (!window.Plaid) {
        setError('No pude abrir la conexión segura del banco.');
        return;
      }

      const handler = window.Plaid.create({
        token: tokenData.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const exchangeResponse = await fetchWithSessionRefresh('/api/bank/plaid/exchange-public-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                publicToken,
                institution: metadata.institution,
              }),
            });
            const exchangeData = await exchangeResponse.json();

            if (!exchangeResponse.ok || !exchangeData.success) {
              setError(exchangeData.error || 'El banco autorizo la conexion, pero no pude guardarla en tu cuenta.');
              return;
            }

            setMessage('Banco conectado correctamente.');
            await refreshStatus();
          } finally {
            setConnectingPlaid(false);
          }
        },
        onExit: (plaidError) => {
          if (plaidError?.error_message) setError(plaidError.error_message);
          setConnectingPlaid(false);
        },
      });

      handler.open();
    } catch (plaidError: unknown) {
      const plaidMessage = plaidError instanceof Error ? plaidError.message : 'No pude iniciar la conexión bancaria.';
      setError(plaidMessage);
      setConnectingPlaid(false);
    }
  }

  function connectSelectedBank() {
    if (selectedCountryProvider?.id === 'plaid') {
      void connectPlaid();
      return;
    }

    setMessage('');
    setError('La conexion bancaria para este pais ya esta mapeada internamente, pero todavia falta activar el flujo seguro de inicio de sesion.');
  }

  async function syncBankNow() {
    setSyncingBank(true);
    setError('');
    setMessage('');

    try {
      const response = await fetchWithSessionRefresh('/api/bank/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || data.results?.flatMap?.((result: { errors?: string[] }) => result.errors || []).join(' · ') || 'No pude sincronizar el banco.');
        return;
      }

      setMessage(`Banco sincronizado: ${data.totals?.insertedOrUpdated || 0} movimientos actualizados.`);
      await refreshStatus();
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setSyncingBank(false);
    }
  }

  async function syncGmailNow() {
    setSyncingGmail(true);
    setError('');
    setMessage('');

    try {
      const response = await fetchWithSessionRefresh('/api/email/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || 'No pude sincronizar Gmail/Banco.');
        return;
      }

      const totals = data.totals || {};
      const skippedReason = data.results?.find?.((result: { skipped?: string }) => result.skipped)?.skipped;

      if (skippedReason === 'missing_oauth_tokens' || skippedReason === 'missing_refresh_token') {
        setError('Gmail está vinculado por email, pero falta reconectarlo con Google para guardar tokens OAuth. Usa "Reconectar Google/Gmail".');
        return;
      }

      const failed = totals.failed || 0;
      const baseMessage = `Sincronización lista: ${totals.inserted || 0} nuevos, ${totals.duplicate || 0} duplicados, ${totals.ignored || 0} ignorados, ${totals.skippedMessages || 0} ya procesados.`;
      setMessage(failed ? `${baseMessage} Fallaron ${failed}; revisa configuración o permisos.` : baseMessage);
      await refreshStatus();
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setSyncingGmail(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-8 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-blue-600 text-lg font-black text-white">D</div>
              <p className="text-sm font-bold text-slate-900">Dashboard Financiero</p>
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Configura tu dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Deja lista tu cuenta, presupuesto inicial e integraciones para que tus movimientos queden separados de cualquier otro usuario.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            Ver dashboard
          </Link>
        </header>

        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

        {!loading && !hasProfile && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold text-amber-900">Necesitas iniciar sesión</h2>
            <p className="mt-1 text-sm text-amber-700">Entra con Google, GitHub o email para crear tu perfil automáticamente.</p>
            <Link
              href="/login?next=/onboarding"
              className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Ir a login
            </Link>
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-5">
          {checklist.map((item) => (
            <div key={item.label} className={`rounded-lg border p-4 shadow-sm ${statusTone(item.done)}`}>
              <p className="text-2xl font-bold">{item.done ? 'OK' : 'Pendiente'}</p>
              <p className="mt-1 text-sm font-semibold">{item.label}</p>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Estado de configuración</h2>
              <p className="text-sm text-slate-500">{loading ? 'Leyendo tu cuenta...' : `${completed} de ${checklist.length} pasos listos`}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
              Perfil: {status?.profileId || 'sin sesión'}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={saveProfile} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Perfil y presupuesto</h2>
            <p className="mt-1 text-sm text-slate-500">El presupuesto inicial se divide en Vida, Placeres y Futuro.</p>
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-medium text-slate-600">
                Nombre
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                  placeholder="Tu nombre"
                />
              </label>
              <label className="block text-sm font-medium text-slate-600">
                Meta mensual inicial
                <input
                  value={monthlyTarget}
                  onChange={(event) => setMonthlyTarget(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                  placeholder="60000"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {['Vida', 'Placeres', 'Futuro'].map((label) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(third)}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={!hasProfile || savingProfile}
              className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingProfile ? 'Guardando...' : hasInitialBudget ? 'Guardar perfil' : 'Crear presupuesto inicial'}
            </button>
          </form>

          <div className="grid gap-6">
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Telegram</h2>
              <p className="mt-1 text-sm text-slate-500">Genera un código y mándaselo al bot para conectar tu chat sin copiar IDs técnicos.</p>
              {telegramCode && (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold text-emerald-700">Código para Telegram</p>
                  <p className="mt-2 font-mono text-3xl font-bold text-emerald-900">{telegramCode}</p>
                  <p className="mt-2 text-sm text-emerald-700">
                    Envíalo al bot tal cual. Expira {telegramExpiresAt ? new Date(telegramExpiresAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'en 15 minutos'}.
                  </p>
                  {telegramDeepLink && (
                    <a
                      href={telegramDeepLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      Abrir Telegram
                    </a>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={generateTelegramCode}
                disabled={!hasProfile || linkingTelegram}
                className="mt-5 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linkingTelegram ? 'Generando...' : hasTelegram ? 'Generar otro código' : 'Generar código de Telegram'}
              </button>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Conexion bancaria</h2>
              <p className="mt-1 text-sm text-slate-500">Primero dinos donde esta tu banco. Despues elegimos el proveedor mas adecuado para sincronizar movimientos.</p>
              <label className="mt-5 block text-sm font-medium text-slate-600">
                1. Pais de tu banco
                <select
                  value={bankCountry}
                  onChange={(event) => {
                    const nextCountry = bankCountryOptions.find((country) => country.code === event.target.value) || bankCountryOptions[0];
                    setBankCountry(nextCountry.code);
                    setBankName(nextCountry.banks[0]);
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors focus:border-blue-500"
                >
                  {bankCountryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-sm font-medium text-slate-600">
                2. Banco principal
                <select
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors focus:border-blue-500"
                >
                  {selectedBankCountry.banks.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">3. Ruta de conexion</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedCountryProvider?.name || 'Proveedor por confirmar'} para {bankName}</p>
                <p className="mt-1 text-sm text-slate-600">{selectedCountryStatus}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Tus credenciales bancarias se ingresan en una ventana segura del proveedor autorizado. El dashboard solo recibe acceso de lectura.
                </p>
              </div>
              {activeBankConnections.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {activeBankConnections.map((connection) => (
                    <p key={connection.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      Banco conectado: {connection.institution_name || connection.provider}
                    </p>
                  ))}
                </div>
              )}
              {activeGmailIntegrations.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {activeGmailIntegrations.map((integration) => (
                    <p key={integration.id} className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-700">
                      Correo bancario {integration.oauthConnected ? 'conectado' : 'vinculado, pendiente de autorizacion'}: {integration.email}
                    </p>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={connectSelectedBank}
                disabled={!hasProfile || !canConnectSelectedCountry || connectingPlaid}
                className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connectingPlaid ? 'Abriendo conexion segura...' : canConnectSelectedCountry ? `Conectar ${bankName}` : 'Conexion directa en preparacion'}
              </button>
              <button
                type="button"
                onClick={syncBankNow}
                disabled={!hasProfile || !hasBankConnection || syncingBank}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingBank ? 'Sincronizando movimientos...' : 'Actualizar movimientos bancarios'}
              </button>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-sm font-semibold text-slate-900">Fallback por correo bancario</p>
                <p className="mt-1 text-xs text-slate-500">Usalo solo si tu banco todavia no tiene conexion directa. Leemos correos bancarios autorizados y convertimos cargos/abonos en movimientos.</p>
                <button
                  type="button"
                  onClick={startGmailOAuth}
                  disabled={!hasProfile}
                  className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {hasGmail ? 'Agregar otro correo bancario' : 'Usar correo bancario'}
                </button>
                <button
                  type="button"
                  onClick={syncGmailNow}
                  disabled={!hasProfile || !hasGmailOAuth || syncingGmail}
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {syncingGmail ? 'Sincronizando correos...' : 'Actualizar movimientos desde correo'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
