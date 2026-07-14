'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

const satAllInOneSiteId = '61c12b8cde3c034b3c8b25b1';

type SyncfyFiscalWidgetConstructor = new (params: {
  element: string;
  token: string;
  enableTestMode?: boolean;
  config: {
    locale: string;
    entrypoint: { site: string };
    navigation: { oneSiteFlow: boolean; displayStatusInToast: boolean };
  };
}) => {
  close?: () => void;
  on?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  open: () => void;
};

function notifyParent(message: Record<string, unknown>) {
  window.parent?.postMessage(message, window.location.origin);
}

export default function SyncfyFiscalEmbedClient() {
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState('');
  const openedRef = useRef(false);
  const widgetRef = useRef<InstanceType<SyncfyFiscalWidgetConstructor> | null>(null);

  useEffect(() => {
    if (!scriptReady || openedRef.current) return;
    openedRef.current = true;
    notifyParent({ type: 'fiscal-syncfy:ready' });

    async function openWidget() {
      try {
        const SyncfyFiscalWidget = (window as unknown as { SyncfyWidget?: SyncfyFiscalWidgetConstructor }).SyncfyWidget;
        if (!SyncfyFiscalWidget) throw new Error('La conexión segura todavía no está lista.');
        const sessionResponse = await fetch('/api/bank/syncfy/session', { method: 'POST' });
        const sessionData = await sessionResponse.json() as { success?: boolean; session?: { token?: string } };
        if (!sessionResponse.ok || !sessionData.success || !sessionData.session?.token) throw new Error('No pude iniciar la conexión segura con Syncfy.');

        const root = document.getElementById('syncfy-fiscal-root');
        if (!root) throw new Error('No pude preparar la ventana del SAT.');
        root.innerHTML = '';

        const widget = new SyncfyFiscalWidget({
          element: '#syncfy-fiscal-root',
          token: sessionData.session.token,
          enableTestMode: process.env.NODE_ENV !== 'production',
          config: {
            locale: 'es',
            entrypoint: { site: satAllInOneSiteId },
            navigation: { oneSiteFlow: true, displayStatusInToast: true },
          },
        });

        widget.on?.('success', (eventPayload) => {
          void fetch('/api/fiscal/syncfy/connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event: eventPayload }),
          })
            .then(async (response) => {
              const data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.error || 'No pude guardar la conexión fiscal.');
              return fetch('/api/fiscal/syncfy/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initialConnection: true }),
              });
            })
            .then(async (response) => {
              const data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.error || 'La conexión quedó guardada, pero la descarga sigue pendiente.');
              notifyParent({
                type: 'fiscal-syncfy:success',
                saved: data.saved || 0,
                providerDocumentsSaved: data.providerDocumentsSaved || 0,
                warning: data.warning || null,
              });
            })
            .catch((caught: unknown) => {
              const message = caught instanceof Error ? caught.message : 'No pude completar la conexión fiscal.';
              setError(message);
              notifyParent({ type: 'fiscal-syncfy:error', message });
            });
        });
        widget.on?.('401', () => notifyParent({ type: 'fiscal-syncfy:error', message: 'La sesión de Syncfy expiró. Vuelve a intentarlo.' }));
        widget.on?.('close', () => notifyParent({ type: 'fiscal-syncfy:closed' }));
        widget.on?.('exit', () => notifyParent({ type: 'fiscal-syncfy:closed' }));
        widgetRef.current = widget;
        widget.open();
      } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : 'No pude abrir la conexión fiscal.';
        setError(message);
        notifyParent({ type: 'fiscal-syncfy:error', message });
      }
    }

    void openWidget();
    return () => {
      widgetRef.current?.close?.();
      widgetRef.current = null;
    };
  }, [scriptReady]);

  return (
    <>
      <link rel="stylesheet" href="https://syncfy.com/widget/v3/syncfy-authentication-widget.css" />
      <Script
        src="https://syncfy.com/widget/v3/syncfy-authentication-widget.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => setError('No pude cargar la conexión segura de Syncfy.')}
      />
      <main className="min-h-screen bg-[#eef3f7]">
        <div id="syncfy-fiscal-root" className="min-h-screen" />
        {!scriptReady && <div className="grid min-h-screen place-items-center px-6 text-sm font-semibold text-slate-600">Preparando conexión segura con el SAT...</div>}
        {error && <div className="fixed inset-x-4 bottom-4 rounded-lg border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow">{error}</div>}
      </main>
    </>
  );
}
