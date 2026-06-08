"use client";

import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, next }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'No pude iniciar sesión.');
        return;
      }

      window.location.href = result.next || '/';
    } catch {
      setError('No pude conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#123b4a_0,#07111f_34%,#020617_72%)] px-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/75 p-6 shadow-2xl shadow-slate-950/60 backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Acceso privado</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Dashboard Financiero</h1>
        <p className="mt-2 text-sm text-slate-400">
          Ingresa el token privado para consultar tus datos financieros.
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-300">
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

        {error && <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <button
          type="submit"
          disabled={loading || !token.trim()}
          className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
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
