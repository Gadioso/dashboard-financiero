"use client";

import { FormEvent, useState } from 'react';
import VirafiBrand from '@/app/Components/VirafiBrand';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const response = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
    setLoading(false);

    if (!response.ok || !data?.success) {
      setError(data?.error || 'No pudimos actualizar la contraseña.');
      return;
    }

    window.location.replace('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--brand-cream)] px-4 text-slate-950">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <VirafiBrand compact />
        <h1 className="mt-6 text-3xl">Crea una nueva contraseña</h1>
        <p className="mt-2 text-sm text-slate-500">Usa al menos ocho caracteres y no reutilices una contraseña de otro servicio.</p>
        <label className="mt-6 block text-sm font-medium text-slate-600">
          Nueva contraseña
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-600">
          Confirmar contraseña
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
        </label>
        {error ? <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <button disabled={loading || password.length < 8 || confirmation.length < 8} className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? 'Actualizando...' : 'Guardar contraseña'}
        </button>
      </form>
    </main>
  );
}
