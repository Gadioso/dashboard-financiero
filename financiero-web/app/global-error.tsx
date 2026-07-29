'use client';

import { useEffect } from 'react';
import VirafiBrand from '@/app/Components/VirafiBrand';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-[var(--brand-cream)] text-slate-950">
        <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
          <section className="w-full rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
            <VirafiBrand compact />
            <h1 className="mt-8 text-3xl font-bold">Algo salió mal</h1>
            <p className="mt-3 text-slate-500">El error quedó registrado. Puedes volver a intentar sin perder tu sesión.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Intentar de nuevo
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
