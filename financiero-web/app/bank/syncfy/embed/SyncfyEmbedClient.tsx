"use client";

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

type SyncfyWidgetConstructor = new (params: {
  element: string;
  token: string;
  config: {
    locale: string;
    entrypoint: {
      country: string;
      siteOrganizationType: string;
    };
    navigation: {
      displayStatusInToast: boolean;
    };
  };
}) => {
  close?: () => void;
  on?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  open: () => void;
};

declare global {
  interface Window {
    SyncfyWidget?: SyncfyWidgetConstructor;
  }
}

type SessionResponse = {
  success: boolean;
  error?: string;
  session?: {
    token: string;
  };
  widget?: {
    locale: string;
    country: string;
    siteOrganizationType: string;
  };
};

type SyncfyConnectionResponse = {
  success: boolean;
  error?: string;
};

type SyncfySyncResponse = {
  success: boolean;
  error?: string;
  totals?: {
    transactions?: number;
  };
};

type SyncfyEmbedClientProps = {
  country: string;
};

function notifyParent(message: Record<string, unknown>) {
  window.parent?.postMessage(message, window.location.origin);
}

export default function SyncfyEmbedClient({ country }: SyncfyEmbedClientProps) {
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState('');
  const widgetRef = useRef<InstanceType<SyncfyWidgetConstructor> | null>(null);
  const openedRef = useRef(false);

  const confirmSyncfyConnection = useCallback(async (eventPayload?: unknown) => {
    const response = await fetch('/api/bank/syncfy/connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        country,
        event: eventPayload || null,
      }),
    });
    const data = (await response.json()) as SyncfyConnectionResponse;

    if (!response.ok || !data.success) {
      throw new Error('El banco se conectó, pero no pude terminar de guardarlo. Intenta nuevamente.');
    }
  }, [country]);

  const syncSyncfyData = useCallback(async () => {
    const response = await fetch('/api/bank/syncfy/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialConnection: true }),
    });
    const data = (await response.json()) as SyncfySyncResponse;

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'El banco quedó conectado, pero la primera sincronización quedó pendiente.');
    }

    return data.totals;
  }, []);

  useEffect(() => {
    if (!scriptReady || openedRef.current) return;

    openedRef.current = true;
    notifyParent({ type: 'syncfy:ready' });

    async function openWidget() {
      try {
        if (!window.SyncfyWidget) {
          throw new Error('La ventana de conexión todavía no está lista.');
        }

        const response = await fetch('/api/bank/syncfy/session', { method: 'POST' });
        const data = (await response.json()) as SessionResponse;

        if (!response.ok || !data.success || !data.session?.token || !data.widget) {
          throw new Error('No pude iniciar la conexión segura. Intenta nuevamente.');
        }

        const root = document.getElementById('syncfy-embed-root');

        if (!root) {
          throw new Error('No pude preparar la ventana segura.');
        }

        root.innerHTML = '';

        const syncfyWidget = new window.SyncfyWidget({
          element: '#syncfy-embed-root',
          token: data.session.token,
          config: {
            locale: data.widget.locale,
            entrypoint: {
              country: data.widget.country,
              siteOrganizationType: data.widget.siteOrganizationType,
            },
            navigation: {
              displayStatusInToast: true,
            },
          },
        });

        syncfyWidget.on?.('success', (eventPayload) => {
          void confirmSyncfyConnection(eventPayload)
            .then(() => syncSyncfyData())
            .then((totals) => {
              notifyParent({
                type: 'syncfy:success',
                movements: totals?.transactions ?? 0,
              });
            })
            .catch((connectionError: unknown) => {
              const message = connectionError instanceof Error ? connectionError.message : 'No pude guardar la conexión bancaria.';
              setError(message);
              notifyParent({ type: 'syncfy:error', message });
            });
        });
        syncfyWidget.on?.('401', () => {
          const message = 'La sesión expiró. Vuelve a presionar “Agregar conexión con tu banco”.';
          setError(message);
          notifyParent({ type: 'syncfy:error', message });
        });
        syncfyWidget.on?.('close', () => notifyParent({ type: 'syncfy:closed' }));
        syncfyWidget.on?.('exit', () => notifyParent({ type: 'syncfy:closed' }));

        widgetRef.current = syncfyWidget;
        syncfyWidget.open();
      } catch (caughtError: unknown) {
        const caughtMessage = caughtError instanceof Error ? caughtError.message : '';
        const message = caughtMessage.includes('undefined')
          ? 'No pude abrir la ventana segura. Recarga la página e intenta de nuevo.'
          : caughtMessage || 'No pude abrir la conexión bancaria.';
        setError(message);
        notifyParent({ type: 'syncfy:error', message });
      }
    }

    void openWidget();

    return () => {
      widgetRef.current?.close?.();
      widgetRef.current = null;
    };
  }, [confirmSyncfyConnection, country, scriptReady, syncSyncfyData]);

  return (
    <>
      <link rel="stylesheet" href="https://syncfy.com/widget/v3/syncfy-authentication-widget.css" />
      <Script
        src="https://syncfy.com/widget/v3/syncfy-authentication-widget.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => {
          const message = 'No pude cargar la conexión bancaria. Intenta de nuevo en unos segundos.';
          setError(message);
          notifyParent({ type: 'syncfy:error', message });
        }}
      />
      <main className="min-h-screen bg-[#eef3f7]">
        <div id="syncfy-embed-root" className="min-h-screen" />
        {!scriptReady && (
          <div className="grid min-h-screen place-items-center px-6 text-center text-sm font-semibold text-slate-600">
            Preparando conexión segura...
          </div>
        )}
        {error && (
          <div className="fixed inset-x-4 bottom-4 rounded-lg border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow">
            {error}
          </div>
        )}
      </main>
    </>
  );
}
