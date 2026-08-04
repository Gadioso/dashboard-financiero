"use client";

import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { FaApple } from 'react-icons/fa6';
import { FcGoogle } from 'react-icons/fc';
import VirafiBrand from '@/app/Components/VirafiBrand';
import LanguageSwitcher from '@/app/Components/LanguageSwitcher';
import { useLocale } from '@/app/Components/LocaleProvider';

function LoginForm() {
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';
  const routeError = searchParams.get('error') || '';
  const [mode, setMode] = useState<'account' | 'private'>('account');
  const [accountAction, setAccountAction] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState<'MX' | 'US'>(() => {
    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) return 'US';
    return 'MX';
  });
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const safeLoginError = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return /supabase|api|schema|token|secret|key|oauth|env\b|configurad/i.test(text) ? (locale === 'en-US' ? 'Access is unavailable right now. Please try again.' : 'El acceso no está disponible en este momento. Intenta nuevamente.') : text || (locale === 'en-US' ? 'Could not sign in.' : 'No pude iniciar sesión.');
  };

  async function submit(action: 'login' | 'signup' = accountAction, event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(action === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'private'
            ? { token, next }
            : {
                email,
                password,
                fullName,
                countryCode,
                next,
              }
        ),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(safeLoginError(result.error));
        return;
      }

      if (result.needsEmailConfirmation) {
        setMessage(result.message || (locale === 'en-US' ? 'Account created. Check your email to confirm access.' : 'Cuenta creada. Revisa tu correo para confirmar el acceso.'));
        return;
      }

      window.location.href = result.next || '/dashboard';
    } catch {
      setError(locale === 'en-US' ? 'Could not connect to the server.' : 'No pude conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  function startOAuth(provider: 'google' | 'apple') {
    setLoading(true);
    setError('');
    window.location.href = `/api/auth/oauth?provider=${provider}&next=${encodeURIComponent(next)}`;
  }

  async function requestRecovery() {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => null) as { message?: string; error?: string } | null;

      if (!response.ok) {
        setError(result?.error || (locale === 'en-US' ? 'We could not start account recovery.' : 'No pudimos iniciar la recuperación.'));
        return;
      }

      setMessage(result?.message || (locale === 'en-US' ? 'If the account exists, you will receive recovery instructions.' : 'Si la cuenta existe, recibirás instrucciones para recuperar el acceso.'));
    } catch {
      setError(locale === 'en-US' ? 'Could not connect to the server.' : 'No pude conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  function chooseMode(nextMode: 'account' | 'private') {
    setMode(nextMode);
    setError('');
    setMessage('');
  }

  return (
    <main className="grid min-h-screen bg-[var(--brand-cream)] text-slate-950 lg:grid-cols-[1fr_480px]">
      <section className="hidden border-r border-slate-200 bg-[var(--brand-ink)] p-10 text-[var(--brand-cream)] lg:flex lg:flex-col lg:justify-between">
        <div>
          <VirafiBrand inverse showTagline />
          <div className="mt-20 max-w-xl">
            <h1 className="text-5xl leading-[1.08] text-[var(--brand-cream)]">{locale === 'en-US' ? 'Virafi helps you see clearly where your wealth is headed.' : 'Virafi te ayuda a ver con claridad hacia dónde va tu patrimonio.'}</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-white/60">
              {locale === 'en-US' ? 'Bring together accounts, transactions, goals, savings, and investments in one direction.' : 'Conecta cuentas, movimientos, metas, ahorro e inversión en un solo rumbo.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(locale === 'en-US' ? ['Clarity', 'Direction', 'Progress'] : ['Claridad', 'Rumbo', 'Progreso']).map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-[var(--brand-cream)]">{item}</p>
              <p className="mt-1 text-xs text-white/45">{locale === 'en-US' ? 'At your pace' : 'A tu ritmo'}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={(event) => submit(mode === 'account' ? accountAction : 'login', event)} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <VirafiBrand compact />
        </div>
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-blue-700">{t('financialDirection')}</p><LanguageSwitcher compact /></div>
        <h1 className="mt-3 text-3xl tracking-tight text-slate-950">{t('login')}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {t('loginDescription')}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => chooseMode('account')}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === 'account' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {t('account')}
          </button>
          <button
            type="button"
            onClick={() => chooseMode('private')}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === 'private' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {t('backupAccess')}
          </button>
        </div>

        {mode === 'account' ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setAccountAction('login')}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${accountAction === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {t('enter')}
              </button>
              <button
                type="button"
                onClick={() => setAccountAction('signup')}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${accountAction === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {t('signUp')}
              </button>
            </div>
            <label className="block text-sm font-medium text-slate-600">
              {t('email')}
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                placeholder="tu@email.com"
              />
            </label>
            <label className="block text-sm font-medium text-slate-600">
              {t('password')}
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                placeholder={locale === 'en-US' ? 'At least 8 characters' : 'Mínimo 8 caracteres'}
              />
            </label>
            {accountAction === 'login' ? (
              <button
                type="button"
                onClick={requestRecovery}
                disabled={loading || !email.trim()}
                className="text-left text-sm font-semibold text-blue-700 hover:text-blue-800 disabled:opacity-50"
              >
                {t('forgotPassword')}
              </button>
            ) : null}
            {accountAction === 'signup' && (
              <>
                <label className="block text-sm font-medium text-slate-600">
                  {t('fullName')}
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    type="text"
                    autoComplete="name"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                    placeholder={locale === 'en-US' ? 'Your name' : 'Tu nombre'}
                  />
                </label>
                <label className="block text-sm font-medium text-slate-600">
                  {t('country')}
                  <select
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value as 'MX' | 'US')}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors focus:border-blue-500"
                  >
                    <option value="MX">{t('mexico')} — {locale === 'en-US' ? 'email in Spanish' : 'correo en español'}</option>
                    <option value="US">{t('unitedStates')} — email in English</option>
                  </select>
                </label>
              </>
            )}
          </div>
        ) : (
          <label className="mt-5 block text-sm font-medium text-slate-600">
            {locale === 'en-US' ? 'Access code' : 'Código de acceso'}
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
              placeholder={locale === 'en-US' ? 'Access code' : 'Código de acceso'}
            />
          </label>
        )}

        {(error || routeError) && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error || safeLoginError(routeError)}</p>}
        {message && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        {mode === 'account' && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('continueWith')}</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startOAuth('google')}
                disabled={loading}
                aria-label={locale === 'en-US' ? 'Continue with Google' : 'Continuar con Google'}
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FcGoogle aria-hidden="true" className="size-5 shrink-0" />
                <span>Google</span>
              </button>
              <button
                type="button"
                onClick={() => startOAuth('apple')}
                disabled={loading}
                aria-label={locale === 'en-US' ? 'Continue with Apple' : 'Continuar con Apple'}
                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-lg border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaApple aria-hidden="true" className="size-5 shrink-0" />
                <span>Apple</span>
              </button>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={loading || (mode === 'private' ? !token.trim() : !email.trim() || password.length < 8)}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (locale === 'en-US' ? 'Signing in…' : 'Entrando...') : mode === 'account' && accountAction === 'signup' ? t('signUp') : t('enter')}
        </button>
        <div className="mt-5 flex justify-center gap-4 text-xs text-slate-500">
          <a href="/privacy" className="hover:text-blue-700">{locale === 'en-US' ? 'Privacy' : 'Privacidad'}</a>
          <a href="/terms" className="hover:text-blue-700">{locale === 'en-US' ? 'Terms' : 'Términos'}</a>
        </div>
      </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--brand-cream)] px-4 text-slate-950">
          <VirafiBrand showTagline />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
