'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#07101f] text-slate-100">
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
          <section className="w-full border border-slate-700 bg-[#050b18] p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Dashboard Financiero</p>
            <h1 className="mt-4 text-3xl font-bold">Algo salió mal</h1>
            <p className="mt-3 text-slate-400">El error quedó registrado. Puedes volver a intentar sin perder tu sesión.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full bg-emerald-400 px-4 py-3 font-semibold text-slate-950 hover:bg-emerald-300"
            >
              Intentar de nuevo
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
