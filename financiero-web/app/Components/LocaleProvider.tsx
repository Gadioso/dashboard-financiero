'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import React from 'react';
import { AppLocale, detectBrowserLocale, localeFromCountry, MessageKey, translate, translateUiText } from '@/lib/i18n';

type LocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void; t: (key: MessageKey) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = 'virafi-locale';

function LocalizedContent({ children, locale }: { children: React.ReactNode; locale: AppLocale }) {
  if (locale === 'es-MX') return <>{children}</>;
  function visit(node: React.ReactNode): React.ReactNode {
    if (typeof node === 'string') return translateUiText(locale, node);
    if (!React.isValidElement(node)) return node;
    if (['input', 'textarea', 'select', 'option', 'script', 'style', 'code', 'pre'].includes(String(node.type))) return node;
    const props = node.props as { children?: React.ReactNode };
    return React.cloneElement(node, undefined, React.Children.map(props.children, visit));
  }
  return <>{React.Children.map(children, visit)}</>;
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    if (typeof window === 'undefined') return 'es-MX';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'en-US' || stored === 'es-MX' ? stored : detectBrowserLocale();
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored === 'en-US' || stored === 'es-MX' ? stored : detectBrowserLocale();
    document.documentElement.lang = initial;

    void fetch('/api/account/status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { profile?: { locale?: string | null; country_code?: string | null } | null } | null) => {
        const profileLocale = data?.profile?.locale === 'en-US' || data?.profile?.locale === 'es-MX'
          ? data.profile.locale
          : localeFromCountry(data?.profile?.country_code);
        if (profileLocale) {
          if (!stored) {
            setLocaleState(profileLocale);
            document.documentElement.lang = profileLocale;
          }
          return;
        }
        if (!stored && data?.profile) {
          void fetch('/api/account/locale', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locale: initial }),
          }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `virafi_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    void fetch('/api/account/locale', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent('virafi-locale-change', { detail: next }));
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey) => translate(locale, key) }), [locale, setLocale]);
  return (
    <LocaleContext.Provider value={value}>
      <LocalizedContent locale={locale}>{children}</LocalizedContent>
      <div className="pointer-events-auto fixed right-4 top-4 z-[100] rounded-lg border border-slate-300 bg-white p-1.5 shadow-xl backdrop-blur md:right-6 md:top-5">
        <label className="flex min-w-28 items-center gap-2 px-2 text-xs font-bold text-slate-600">
          <span aria-hidden="true">🌐</span><span className="sr-only">{translate(locale, 'language')}</span>
          <select
            aria-label={translate(locale, 'language')}
            value={locale}
            onChange={(event) => setLocale(event.target.value as AppLocale)}
            className="h-8 cursor-pointer bg-transparent text-xs font-bold text-slate-700 outline-none"
          >
            <option value="es-MX">🇲🇽 {translate(locale, 'spanish')}</option>
            <option value="en-US">🇺🇸 {translate(locale, 'english')}</option>
          </select>
        </label>
      </div>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
