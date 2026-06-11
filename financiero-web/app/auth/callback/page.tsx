"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function CallbackHandler() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('Completando acceso...');

  useEffect(() => {
    async function completeLogin() {
      const next = searchParams.get('next') || '/';
      const queryError = searchParams.get('error_description') || searchParams.get('error');

      if (queryError) {
        window.location.replace(`/login?error=${encodeURIComponent(queryError)}&next=${encodeURIComponent(next)}`);
        return;
      }

      const code = searchParams.get('code');

      if (code) {
        window.location.replace(`/api/auth/callback?${new URLSearchParams({ code, next }).toString()}`);
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashError = hashParams.get('error_description') || hashParams.get('error');

      if (hashError) {
        window.location.replace(`/login?error=${encodeURIComponent(hashError)}&next=${encodeURIComponent(next)}`);
        return;
      }

      if (!accessToken || !refreshToken) {
        window.location.replace(`/login?error=${encodeURIComponent('No pude completar el acceso con el proveedor.')}&next=${encodeURIComponent(next)}`);
        return;
      }

      setMessage('Guardando sesión...');

      const response = await fetch('/api/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, refreshToken, next }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string; next?: string } | null;

      if (!response.ok || !result?.success) {
        window.location.replace(`/login?error=${encodeURIComponent(result?.error || 'No pude guardar la sesión.')}&next=${encodeURIComponent(next)}`);
        return;
      }

      window.location.replace(result.next || next);
    }

    completeLogin().catch(() => {
      window.location.replace('/login?error=No pude completar el acceso.');
    });
  }, [searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <p className="text-sm text-slate-400">{message}</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
          <p className="text-sm text-slate-400">Completando acceso...</p>
        </main>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
