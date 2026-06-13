"use client";

import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const routeError = searchParams.get('error') || '';
  const [mode, setMode] = useState<'account' | 'private'>('account');
  const [accountAction, setAccountAction] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
                next,
              }
        ),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'No pude iniciar sesión.');
        return;
      }

      if (result.needsEmailConfirmation) {
        setMessage(result.message || 'Cuenta creada. Revisa tu correo para confirmar el acceso.');
        return;
      }

      window.location.href = result.next || '/';
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  function startOAuth(provider: 'google' | 'github') {
    setLoading(true);
    setError('');
    window.location.href = `/api/auth/oauth?provider=${provider}&next=${encodeURIComponent(next)}`;
  }

  function chooseMode(nextMode: 'account' | 'private') {
    setMode(nextMode);
    setError('');
    setMessage('');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#123b4a_0,#07111f_34%,#020617_72%)] px-4 text-slate-100">
      <form onSubmit={(event) => submit(mode === 'account' ? accountAction : 'login', event)} className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Acceso financiero</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Dashboard Financiero</h1>
        <p className="mt-2 text-sm text-slate-400">
          Entra con tu cuenta para consultar solo tus datos. El token privado queda como acceso de emergencia.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => chooseMode('account')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'account' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Cuenta
          </button>
          <button
            type="button"
            onClick={() => chooseMode('private')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${mode === 'private' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Token privado
          </button>
        </div>

        {mode === 'account' ? (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setAccountAction('login')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${accountAction === 'login' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'}`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setAccountAction('signup')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${accountAction === 'signup' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-100'}`}
              >
                Crear cuenta
              </button>
            </div>
            <label className="block text-sm font-medium text-slate-300">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-emerald-500"
                placeholder="tu@email.com"
              />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Contraseña
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-emerald-500"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            {accountAction === 'signup' && (
              <label className="block text-sm font-medium text-slate-300">
                Nombre completo
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  type="text"
                  autoComplete="name"
                  className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-emerald-500"
                  placeholder="Tu nombre"
                />
              </label>
            )}
          </div>
        ) : (
          <label className="mt-5 block text-sm font-medium text-slate-300">
            Token de acceso
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition-colors focus:border-emerald-500"
              placeholder="DASHBOARD_ACCESS_TOKEN"
            />
          </label>
        )}

        {(error || routeError) && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error || routeError}</p>}
        {message && <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}

        {mode === 'account' && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">OAuth</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startOAuth('google')}
                disabled={loading}
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Google
              </button>
              <button
                type="button"
                onClick={() => startOAuth('github')}
                disabled={loading}
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                GitHub
              </button>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={loading || (mode === 'private' ? !token.trim() : !email.trim() || password.length < 8)}
          className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Entrando...' : mode === 'account' && accountAction === 'signup' ? 'Crear cuenta' : 'Entrar'}
        </button>
        <div className="mt-5 flex justify-center gap-4 text-xs text-slate-500">
          <a href="/privacy" className="hover:text-slate-300">Privacidad</a>
          <a href="/terms" className="hover:text-slate-300">Terminos</a>
        </div>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
          <p className="text-sm text-slate-400">Cargando acceso...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
