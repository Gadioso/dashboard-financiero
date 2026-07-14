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
  const safeLoginError = (value: unknown) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return /supabase|api|schema|token|secret|key|oauth|env\b|configurad/i.test(text) ? 'El acceso no está disponible en este momento. Intenta nuevamente.' : text || 'No pude iniciar sesión.';
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

  function startOAuth(provider: 'google' | 'apple') {
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
    <main className="grid min-h-screen bg-[#f5f7fb] text-slate-950 lg:grid-cols-[1fr_480px]">
      <section className="hidden border-r border-slate-200 bg-white p-10 lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-blue-600 text-lg font-black text-white">D</div>
            <div>
              <p className="text-base font-bold leading-tight">Dashboard</p>
              <p className="text-base font-bold leading-tight">Financiero</p>
            </div>
          </div>
          <div className="mt-20 max-w-xl">
            <h1 className="text-5xl font-bold tracking-tight text-slate-950">Control financiero claro para todos tus movimientos.</h1>
            <p className="mt-5 text-base leading-7 text-slate-500">
              Entra para ver tu balance, registrar movimientos con IA y mantener separadas tus bolsas Vida, Placeres y Futuro.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['33/33/33', 'Banco', 'IA'].map((item) => (
            <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">{item}</p>
              <p className="mt-1 text-xs text-slate-500">Activo</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={(event) => submit(mode === 'account' ? accountAction : 'login', event)} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <div className="grid size-10 place-items-center rounded-lg bg-blue-600 text-lg font-black text-white">D</div>
          <div>
            <p className="font-bold leading-tight">Dashboard</p>
            <p className="font-bold leading-tight">Financiero</p>
          </div>
        </div>
        <p className="text-sm font-semibold text-blue-700">Acceso financiero</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Iniciar sesión</h1>
        <p className="mt-2 text-sm text-slate-500">
          Entra con tu cuenta para consultar únicamente tu información financiera.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => chooseMode('account')}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === 'account' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Cuenta
          </button>
          <button
            type="button"
            onClick={() => chooseMode('private')}
            className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${mode === 'private' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            Acceso de respaldo
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
                Entrar
              </button>
              <button
                type="button"
                onClick={() => setAccountAction('signup')}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${accountAction === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                Crear cuenta
              </button>
            </div>
            <label className="block text-sm font-medium text-slate-600">
              Email
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
              Contraseña
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            {accountAction === 'signup' && (
              <label className="block text-sm font-medium text-slate-600">
                Nombre completo
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  type="text"
                  autoComplete="name"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                  placeholder="Tu nombre"
                />
              </label>
            )}
          </div>
        ) : (
          <label className="mt-5 block text-sm font-medium text-slate-600">
            Código de acceso
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
              placeholder="Código de acceso"
            />
          </label>
        )}

        {(error || routeError) && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error || safeLoginError(routeError)}</p>}
        {message && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        {mode === 'account' && (
          <>
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">O continúa con</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startOAuth('google')}
                disabled={loading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Google
              </button>
              <button
                type="button"
                onClick={() => startOAuth('apple')}
                disabled={loading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apple
              </button>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={loading || (mode === 'private' ? !token.trim() : !email.trim() || password.length < 8)}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Entrando...' : mode === 'account' && accountAction === 'signup' ? 'Crear cuenta' : 'Entrar'}
        </button>
        <div className="mt-5 flex justify-center gap-4 text-xs text-slate-500">
          <a href="/privacy" className="hover:text-blue-700">Privacidad</a>
          <a href="/terms" className="hover:text-blue-700">Términos</a>
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
        <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 text-slate-950">
          <p className="text-sm text-slate-500">Cargando acceso...</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
