"use client";

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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
  financialCounts?: Record<string, number>;
  error?: string;
  errors?: string[];
};

const currencyFormatter = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0,
});

function formatCurrency(value: number) {
  return `$${currencyFormatter.format(value)} MXN`;
}

function parseMoney(value: string) {
  const numeric = Number(value.replace(/[,$\s]/g, ''));

  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function statusTone(done: boolean) {
  return done
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : 'border-amber-400/25 bg-amber-400/10 text-amber-100';
}

export default function OnboardingClient() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [fullName, setFullName] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState('60000');
  const [gmailEmail, setGmailEmail] = useState('');
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramDeepLink, setTelegramDeepLink] = useState<string | null>(null);
  const [telegramExpiresAt, setTelegramExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refreshStatus = async ({ keepFeedback = false }: { keepFeedback?: boolean } = {}) => {
    setLoading(true);
    if (!keepFeedback) setError('');

    try {
      const response = await fetch('/api/account/status', { cache: 'no-store' });
      const data = (await response.json()) as AccountStatus;

      if (!response.ok || !data.success) {
        setError(data.error || data.errors?.join(' · ') || 'No pude leer el estado de tu cuenta.');
      }

      setStatus(data);
      setFullName(data.profile?.full_name || '');
      setMonthlyTarget(String(data.profile?.monthly_income_target || 60000));
      setGmailEmail(data.gmailIntegrations?.[0]?.email || data.profile?.email || '');
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      const routeError = params.get('error');

      if (routeError) setError(decodeURIComponent(routeError));
      if (params.get('gmail') === 'connected') setMessage('Gmail/Banco conectado con Google.');
      void refreshStatus({ keepFeedback: Boolean(routeError || params.get('gmail')) });
    });
  }, []);

  const monthlyTargetNumber = parseMoney(monthlyTarget);
  const third = monthlyTargetNumber / 3;
  const hasProfile = Boolean(status?.profileScoped && status.profile?.id);
  const hasInitialBudget = Boolean((status?.financialCounts?.presupuestos_mensuales || 0) > 0);
  const hasTelegram = Boolean((status?.telegramAccounts || []).length > 0);
  const activeGmailIntegration = (status?.gmailIntegrations || []).find((integration) => integration.status === 'active') || null;
  const hasGmail = Boolean(activeGmailIntegration);
  const hasGmailOAuth = Boolean(activeGmailIntegration?.oauthConnected);
  const checklist = useMemo(
    () => [
      { label: 'Cuenta creada', done: hasProfile },
      { label: 'Perfil automático', done: hasProfile && Boolean(status?.profile?.email) },
      { label: 'Presupuesto inicial', done: hasInitialBudget },
      { label: 'Telegram conectado', done: hasTelegram },
      { label: 'Gmail/Banco conectado', done: hasGmail },
    ],
    [hasGmail, hasInitialBudget, hasProfile, hasTelegram, status?.profile?.email]
  );
  const completed = checklist.filter((item) => item.done).length;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/account/onboarding', {
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
      const response = await fetch('/api/account/telegram-link-code', {
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

  async function syncGmailNow() {
    setSyncingGmail(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/email/gmail/sync', {
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#123b4a_0,#07111f_34%,#020617_72%)] px-4 py-8 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Onboarding</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Configura tu dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Deja lista tu cuenta, presupuesto inicial e integraciones para que tus movimientos queden separados de cualquier otro usuario.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-emerald-400/40 hover:text-emerald-200"
          >
            Ver dashboard
          </Link>
        </header>

        {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p>}
        {message && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p>}

        {!loading && !hasProfile && (
          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
            <h2 className="text-lg font-semibold text-amber-100">Necesitas iniciar sesión</h2>
            <p className="mt-1 text-sm text-amber-100/75">Entra con Google, GitHub o email para crear tu perfil automáticamente.</p>
            <Link
              href="/login?next=/onboarding"
              className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
            >
              Ir a login
            </Link>
          </section>
        )}

        <section className="grid gap-3 md:grid-cols-5">
          {checklist.map((item) => (
            <div key={item.label} className={`rounded-2xl border p-4 ${statusTone(item.done)}`}>
              <p className="text-2xl font-bold">{item.done ? 'OK' : 'Pendiente'}</p>
              <p className="mt-1 text-sm font-semibold">{item.label}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold">Estado de configuración</h2>
              <p className="text-sm text-slate-400">{loading ? 'Leyendo tu cuenta...' : `${completed} de ${checklist.length} pasos listos`}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-400">
              Perfil: {status?.profileId || 'sin sesión'}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={saveProfile} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <h2 className="text-xl font-bold">Perfil y presupuesto</h2>
            <p className="mt-1 text-sm text-slate-400">El presupuesto inicial se divide en Vida, Placeres y Futuro.</p>
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-medium text-slate-300">
                Nombre
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-emerald-500"
                  placeholder="Tu nombre"
                />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Meta mensual inicial
                <input
                  value={monthlyTarget}
                  onChange={(event) => setMonthlyTarget(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-emerald-500"
                  placeholder="60000"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {['Vida', 'Placeres', 'Futuro'].map((label) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-bold text-slate-100">{formatCurrency(third)}</p>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={!hasProfile || savingProfile}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingProfile ? 'Guardando...' : hasInitialBudget ? 'Guardar perfil' : 'Crear presupuesto inicial'}
            </button>
          </form>

          <div className="grid gap-6">
            <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
              <h2 className="text-xl font-bold">Telegram</h2>
              <p className="mt-1 text-sm text-slate-400">Genera un código y mándaselo al bot para conectar tu chat sin copiar IDs técnicos.</p>
              {telegramCode && (
                <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4">
                  <p className="text-xs uppercase tracking-wider text-emerald-200/70">Código para Telegram</p>
                  <p className="mt-2 font-mono text-3xl font-bold text-emerald-100">{telegramCode}</p>
                  <p className="mt-2 text-sm text-emerald-100/75">
                    Envíalo al bot tal cual. Expira {telegramExpiresAt ? new Date(telegramExpiresAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'en 15 minutos'}.
                  </p>
                  {telegramDeepLink && (
                    <a
                      href={telegramDeepLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/15"
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
                className="mt-5 w-full rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linkingTelegram ? 'Generando...' : hasTelegram ? 'Generar otro código' : 'Generar código de Telegram'}
              </button>
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
              <h2 className="text-xl font-bold">Gmail / Banco</h2>
              <p className="mt-1 text-sm text-slate-400">Conecta Google para autorizar lectura de Gmail y preparar la ingesta automática de cargos bancarios.</p>
              {gmailEmail && (
                <p className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                  Gmail {hasGmailOAuth ? 'conectado con OAuth' : 'vinculado, pendiente de OAuth'}: {gmailEmail}
                </p>
              )}
              <button
                type="button"
                onClick={startGmailOAuth}
                disabled={!hasProfile}
                className="mt-5 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hasGmail ? 'Reconectar Google/Gmail' : 'Conectar Google/Gmail'}
              </button>
              <button
                type="button"
                onClick={syncGmailNow}
                disabled={!hasProfile || !hasGmailOAuth || syncingGmail}
                className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-cyan-300/30 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncingGmail ? 'Sincronizando...' : 'Sincronizar Gmail ahora'}
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
