"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bank, CheckCircle, Circle, Gear, TelegramLogo, Target, UserCircle } from '@phosphor-icons/react';
import PersonalizationInterview from './PersonalizationInterview';
import ProfileSettings from './ProfileSettings';
import VirafiBrand from '@/app/Components/VirafiBrand';

const fallbackBankConnectionLimit = 1;

type AccountStatus = {
  success: boolean;
  configured?: boolean;
  profileScoped?: boolean;
  profileId?: string | null;
  profile?: {
    id: string;
    email?: string | null;
    full_name?: string | null;
    avatar_path?: string | null;
    bio?: string | null;
    professional_headline?: string | null;
    location?: string | null;
    website_url?: string | null;
    financial_why?: string | null;
    monthly_income_target?: number | string | null;
  } | null;
  telegramAccounts?: Array<{ id: string; chat_id: string; username?: string | null }>;
  bankConnections?: Array<{ id: string; provider: string; institution_name?: string | null; status: string; last_sync_at?: string | null }>;
  billing?: {
    plan: 'free' | 'beta' | 'premium';
    active: boolean;
    limits?: {
      bankConnections: number;
      telegramAccounts: number;
      bankSyncLookbackDays: number;
    };
  };
  personalization?: {
    completed: boolean;
    completedAt?: string | null;
  };
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

const bankCountryOptions: BankCountryOption[] = [
  { code: 'MX', label: 'Mexico', providerPreference: ['syncfy', 'belvo', 'finerio'] },
  { code: 'US', label: 'Estados Unidos', providerPreference: ['plaid'] },
  { code: 'CO', label: 'Colombia', providerPreference: ['prometeo', 'belvo'] },
  { code: 'BR', label: 'Brasil', providerPreference: ['belvo', 'prometeo'] },
  { code: 'CL', label: 'Chile', providerPreference: ['prometeo'] },
  { code: 'PE', label: 'Peru', providerPreference: ['prometeo'] },
  { code: 'AR', label: 'Argentina', providerPreference: ['prometeo'] },
  { code: 'OTHER', label: 'Otro pais', providerPreference: ['prometeo'] },
];

function userSafeMessage(value: unknown, fallback: string) {
  const message = typeof value === 'string' ? value.trim() : '';
  return /supabase|syncfy|plaid|api|schema|migration|token|secret|key|provider|endpoint|webhook|oauth|env\b/i.test(message) ? fallback : message || fallback;
}

export default function OnboardingClient() {
  const [activeTab, setActiveTab] = useState<'profile' | 'finance'>('finance');
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [bankProviders, setBankProviders] = useState<BankProvider[]>([]);
  const [bankCountry, setBankCountry] = useState<BankCountryCode>('MX');
  const [loading, setLoading] = useState(true);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [connectingPlaid, setConnectingPlaid] = useState(false);
  const [syncfyOpening, setSyncfyOpening] = useState(false);
  const [syncfyOverlayOpen, setSyncfyOverlayOpen] = useState(false);
  const [disconnectingBankId, setDisconnectingBankId] = useState('');
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
        setError(userSafeMessage(data.error || data.errors?.join(' · '), 'No pude cargar el estado de tu cuenta. Intenta nuevamente.'));
      }

      setStatus(data);

      const providersResponse = await fetchWithSessionRefresh('/api/bank/providers', { cache: 'no-store' });
      const providersData = await providersResponse.json();

      if (providersResponse.ok && providersData.success) {
        setBankProviders(providersData.providers || []);
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
      if (params.get('tab') === 'profile') setActiveTab('profile');

      if (routeError) setError(decodeURIComponent(routeError));
      void refreshStatus({ keepFeedback: Boolean(routeError) });
    });
  }, [refreshStatus]);

  useEffect(() => {
    function handleSyncfyMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      const data = event.data as { type?: string; message?: string; movements?: number };

      if (data.type === 'syncfy:ready') {
        setSyncfyOpening(false);
        return;
      }

      if (data.type === 'syncfy:closed') {
        setSyncfyOverlayOpen(false);
        setSyncfyOpening(false);
        return;
      }

      if (data.type === 'syncfy:error') {
        setError(userSafeMessage(data.message, 'No pude abrir la conexión bancaria. Intenta nuevamente.'));
        setSyncfyOverlayOpen(false);
        setSyncfyOpening(false);
        return;
      }

      if (data.type === 'syncfy:success') {
        const movements = data.movements ?? 0;
        setMessage(`Banco conectado. Detecté ${movements} movimiento${movements === 1 ? '' : 's'} en la primera sincronización.`);
        setError('');
        setSyncfyOverlayOpen(false);
        setSyncfyOpening(false);
        void refreshStatus({ keepFeedback: true });
      }
    }

    window.addEventListener('message', handleSyncfyMessage);

    return () => window.removeEventListener('message', handleSyncfyMessage);
  }, [refreshStatus]);

  const hasProfile = Boolean(status?.profileScoped && status.profile?.id);
  const hasIdentityProfile = Boolean(status?.profile?.full_name && (status.profile.bio || status.profile.professional_headline || status.profile.financial_why));
  const hasCompletedGoals = Boolean(status?.personalization?.completed);
  const hasTelegram = Boolean((status?.telegramAccounts || []).length > 0);
  const activeBankConnections = (status?.bankConnections || []).filter((connection) => connection.status === 'active');
  const hasBankConnection = activeBankConnections.length > 0;
  const bankConnectionLimit = status?.billing?.limits?.bankConnections ?? fallbackBankConnectionLimit;
  const bankLimitReached = activeBankConnections.length >= bankConnectionLimit;
  const planLabel = status?.billing?.plan === 'premium'
    ? 'Premium'
    : status?.billing?.plan === 'beta'
      ? 'Beta'
      : 'Gratis';
  const selectedBankCountry = bankCountryOptions.find((country) => country.code === bankCountry) || bankCountryOptions[0];
  const selectedCountryProvider = selectedBankCountry.providerPreference
    .map((providerId) => bankProviders.find((provider) => provider.id === providerId))
    .find(Boolean);
  const canConnectSelectedCountry = Boolean(
    selectedCountryProvider?.configured && (selectedCountryProvider.id === 'syncfy' || selectedCountryProvider.id === 'plaid')
  );
  const bankConnectionStatus = canConnectSelectedCountry
    ? 'Conexión automática disponible'
    : 'Conexión segura en preparación';
  const accountLabel = status?.profile?.email || status?.profile?.full_name || 'Cuenta activa';
  const checklist = useMemo(
    () => [
      { label: 'Tu perfil', description: hasProfile ? accountLabel : 'Inicia sesión para guardar tu identidad y preferencias.', done: hasIdentityProfile, href: hasProfile ? '/onboarding?tab=profile' : '/login?next=/onboarding', icon: UserCircle, action: hasIdentityProfile ? 'Actualizar' : hasProfile ? 'Completar perfil' : 'Iniciar sesión' },
      { label: 'Tu plan financiero', description: 'Cuéntale a Virafi tus metas y prioridades para recibir recomendaciones personales.', done: hasCompletedGoals, href: '#personalizacion', icon: Target, action: hasCompletedGoals ? 'Actualizar' : 'Definir metas' },
      { label: 'Asistente en Telegram', description: 'Registra movimientos y consulta tus finanzas desde tu chat.', done: hasTelegram, href: '#telegram', icon: TelegramLogo, action: hasTelegram ? 'Administrar' : 'Conectar' },
      { label: 'Cuentas bancarias', description: 'Consulta saldos y movimientos con conexiones de solo lectura.', done: hasBankConnection, href: '#bancos', icon: Bank, action: hasBankConnection ? 'Administrar' : 'Conectar' },
    ],
    [accountLabel, hasBankConnection, hasCompletedGoals, hasIdentityProfile, hasProfile, hasTelegram]
  );
  const completed = checklist.filter((item) => item.done).length;
  const progressPct = Math.round((completed / checklist.length) * 100);
  const bankConnectTitle = !hasProfile
    ? 'Inicia sesión para agregar bancos.'
    : bankLimitReached
      ? `Tu plan ${planLabel} permite ${bankConnectionLimit} banco${bankConnectionLimit === 1 ? '' : 's'}.`
    : canConnectSelectedCountry
      ? 'Abrir conexión bancaria segura.'
      : 'Pronto activaremos este país.';
  const bankButtonDisabled = connectingPlaid || syncfyOpening || bankLimitReached;

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
        setError(userSafeMessage(data.error, 'No pude generar el código. Intenta nuevamente.'));
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

  function loadPlaidScript() {
    return new Promise<void>((resolve, reject) => {
      if (window.Plaid) {
        resolve();
        return;
      }

      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"]');

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('No pude cargar la conexión bancaria.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No pude cargar la conexión bancaria.'));
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
              setError(exchangeData.error || 'El banco autorizó la conexión, pero no pude guardarla en tu cuenta.');
              return;
            }

            setMessage('Banco conectado correctamente.');
            await refreshStatus();
          } finally {
            setConnectingPlaid(false);
          }
        },
        onExit: (plaidError) => {
          if (plaidError?.error_message) setError('La conexión fue cancelada o no pudo completarse. Intenta nuevamente.');
          setConnectingPlaid(false);
        },
      });

      handler.open();
    } catch (plaidError: unknown) {
      const plaidMessage = plaidError instanceof Error ? plaidError.message : 'No pude iniciar la conexión bancaria.';
      setError(userSafeMessage(plaidMessage, 'No pude iniciar la conexión bancaria. Intenta nuevamente.'));
      setConnectingPlaid(false);
    }
  }

  function closeSyncfyOverlay() {
    setSyncfyOverlayOpen(false);
    setSyncfyOpening(false);
  }

  function openSyncfyWidget() {
    setSyncfyOpening(true);
    setSyncfyOverlayOpen(true);
    setError('');
    setMessage('');
  }

  function connectSelectedBank() {
    if (!hasProfile) {
      window.location.href = `/login?next=${encodeURIComponent('/onboarding')}`;
      return;
    }

    if (bankLimitReached) {
      setMessage('');
      setError(`Tu plan ${planLabel} permite ${bankConnectionLimit} banco${bankConnectionLimit === 1 ? '' : 's'} conectado${bankConnectionLimit === 1 ? '' : 's'}. Elimina uno o mejora tu plan para agregar más.`);
      return;
    }

    if (selectedCountryProvider?.id === 'syncfy') {
      void openSyncfyWidget();
      return;
    }

    if (selectedCountryProvider?.id === 'plaid') {
      void connectPlaid();
      return;
    }

    setMessage('');
    setError('Todavía estamos activando conexiones automáticas para este país.');
  }

  async function disconnectBank(connectionId: string, institutionName?: string | null) {
    const confirmation = window.confirm(`¿Eliminar ${institutionName || 'este banco'} de tu dashboard?`);

    if (!confirmation) return;

    setDisconnectingBankId(connectionId);
    setError('');
    setMessage('');

    try {
      const response = await fetchWithSessionRefresh(`/api/bank/connections/${encodeURIComponent(connectionId)}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(userSafeMessage(data.error, 'No pude eliminar la conexión bancaria. Intenta nuevamente.'));
        return;
      }

      setMessage(`${institutionName || 'Banco'} eliminado de tus conexiones.`);
      await refreshStatus({ keepFeedback: true });
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setDisconnectingBankId('');
    }
  }

  return (
    <>
      {syncfyOverlayOpen && (
        <div className="fixed inset-0 z-50 bg-[#eef3f7]">
          <button
            type="button"
            onClick={closeSyncfyOverlay}
            className="fixed right-4 top-4 z-[60] rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white"
          >
            Volver a configuración
          </button>
          <iframe
            title="Conexión bancaria segura"
            src={`/bank/syncfy/embed?country=${encodeURIComponent(bankCountry)}`}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          />
        </div>
      )}

    <main className="min-h-screen bg-[var(--brand-cream)] px-4 py-8 text-slate-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <VirafiBrand compact />
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{activeTab === 'profile' ? 'Tu perfil' : 'Configuración financiera'}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              {activeTab === 'profile' ? 'Define quién eres y qué quieres que Virafi tome en cuenta.' : 'Personaliza tus metas y administra tus integraciones desde un solo lugar.'}
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

        <nav aria-label="Secciones de configuración" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button type="button" onClick={() => setActiveTab('profile')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors ${activeTab === 'profile' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <UserCircle aria-hidden="true" className="size-5" weight="duotone" /> Perfil
          </button>
          <button type="button" onClick={() => setActiveTab('finance')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors ${activeTab === 'finance' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            <Gear aria-hidden="true" className="size-5" weight="duotone" /> Finanzas e integraciones
          </button>
        </nav>

        {!loading && !hasProfile && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold text-amber-900">Necesitas iniciar sesión</h2>
            <p className="mt-1 text-sm text-amber-700">Entra con Google, Apple o email para crear tu perfil automáticamente.</p>
            <Link
              href="/login?next=/onboarding"
              className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Ir a login
            </Link>
          </section>
        )}

        {activeTab === 'profile' && <ProfileSettings enabled={hasProfile} request={fetchWithSessionRefresh} onSaved={() => refreshStatus({ keepFeedback: true })} />}

        {activeTab === 'finance' && <>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Tu espacio financiero</p>
                <h2 className="mt-1 font-brand text-2xl text-slate-950">Pon Virafi a trabajar para ti</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  {loading ? 'Estamos preparando tu configuración.' : completed === checklist.length ? 'Todo está conectado. Puedes actualizar cualquier parte cuando cambien tus planes.' : 'Completa lo que te resulte útil ahora; puedes volver y ajustar todo después.'}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">{progressPct}% preparado</div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`${progressPct}% de configuración completada`}>
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {checklist.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="grid gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center md:px-6">
                  <span className={`grid size-11 place-items-center rounded-lg ${item.done ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    <Icon aria-hidden="true" className="size-6" weight="duotone" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-950">{item.label}</p>
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${item.done ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {item.done ? <CheckCircle aria-hidden="true" className="size-4" weight="fill" /> : <Circle aria-hidden="true" className="size-4" weight="bold" />}
                        {item.done ? 'Listo' : 'Por completar'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  </div>
                  <Link href={item.href} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50">
                    {item.action} <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        <div id="personalizacion" className="scroll-mt-6">
          <PersonalizationInterview enabled={hasProfile} request={fetchWithSessionRefresh} onCompleted={() => refreshStatus()} />
        </div>

        <div className="grid gap-6">
          <div className="grid gap-6">
            <section id="telegram" className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">Telegram</h2>
              <p className="mt-1 text-sm text-slate-500">Genera un código y mándaselo al bot para conectar tu chat fácilmente.</p>
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

            <section id="bancos" className="scroll-mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mt-1 text-sm text-slate-500">Agrega tus bancos y mantén tus movimientos actualizados automáticamente.</p>
              <label className="mt-5 block text-sm font-medium text-slate-600">
                1. País de tu banco
                <select
                  value={bankCountry}
                  onChange={(event) => {
                    const nextCountry = bankCountryOptions.find((country) => country.code === event.target.value) || bankCountryOptions[0];
                    setBankCountry(nextCountry.code);
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
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-800">{bankConnectionStatus}</p>
                <p className="mt-1 text-xs text-emerald-700">
                  Elige tu institución en una ventana segura. Tus credenciales se ingresan directamente ahí y el dashboard solo recibe movimientos y saldos con permiso de lectura.
                </p>
              </div>
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bancos conectados</p>
                  <p className="text-xs font-semibold text-slate-500">Plan {planLabel}: {activeBankConnections.length}/{bankConnectionLimit}</p>
                </div>
                {activeBankConnections.length > 0 ? (
                  activeBankConnections.map((connection) => (
                    <div key={connection.id} className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{connection.institution_name || 'Banco conectado'}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {connection.last_sync_at
                            ? `Actualizado automáticamente: ${new Date(connection.last_sync_at).toLocaleString('es-MX')}`
                            : 'Actualización automática activa'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void disconnectBank(connection.id, connection.institution_name)}
                        disabled={disconnectingBankId === connection.id}
                        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {disconnectingBankId === connection.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    Aún no has agregado bancos. Puedes conectar varios, uno por uno.
                  </p>
                )}
              </div>
              {canConnectSelectedCountry ? (
                <button
                  type="button"
                  onClick={connectSelectedBank}
                  disabled={bankButtonDisabled}
                  title={bankConnectTitle}
                  className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {connectingPlaid || syncfyOpening
                    ? 'Abriendo conexión segura...'
                    : bankLimitReached
                      ? 'Límite de bancos alcanzado'
                      : !hasProfile
                        ? 'Iniciar sesión para agregar banco'
                      : activeBankConnections.length > 0
                        ? 'Agregar otro banco'
                        : 'Agregar conexión con tu banco'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  title={bankConnectTitle}
                  className="mt-5 w-full rounded-lg bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500"
                >
                  Conexión segura en preparación
                </button>
              )}
            </section>
          </div>
        </div>
        </>}
      </div>
    </main>
    </>
  );
}
