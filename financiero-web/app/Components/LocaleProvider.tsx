'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppLocale, detectBrowserLocale, localeFromCountry, MessageKey, translate, translateUiText } from '@/lib/i18n';

type LocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void; t: (key: MessageKey) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = 'virafi-locale';

const translatableAttributes = ['aria-label', 'placeholder', 'title', 'alt'] as const;

function useDocumentLocalization(locale: AppLocale) {
  const originalText = useRef(new WeakMap<Text, string>());
  const originalAttributes = useRef(new WeakMap<Element, Map<string, string>>());

  useEffect(() => {
    const shouldSkip = (node: Node) => {
      const parent = node.parentElement;
      return Boolean(parent?.closest('script, style, code, pre, textarea, select, option, [data-no-translate]'));
    };
    const localizeText = (node: Text) => {
      if (shouldSkip(node)) return;
      const source = originalText.current.get(node) ?? node.data;
      originalText.current.set(node, source);
      const next = locale === 'en-US' ? translateUiText(locale, source) : source;
      if (node.data !== next) node.data = next;
    };
    const localizeElement = (element: Element) => {
      if (element.matches('script, style, code, pre, textarea, select, option, [data-no-translate]')) return;
      let attributes = originalAttributes.current.get(element);
      for (const attribute of translatableAttributes) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        if (!attributes) {
          attributes = new Map();
          originalAttributes.current.set(element, attributes);
        }
        const source = attributes.get(attribute) ?? current;
        attributes.set(attribute, source);
        const next = locale === 'en-US' ? translateUiText(locale, source) : source;
        if (current !== next) element.setAttribute(attribute, next);
      }
    };
    const localizeTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) localizeText(root as Text);
      if (root.nodeType === Node.ELEMENT_NODE) localizeElement(root as Element);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) localizeText(node as Text);
        else localizeElement(node as Element);
        node = walker.nextNode();
      }
    };
    localizeTree(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') localizeText(mutation.target as Text);
        if (mutation.type === 'childList') mutation.addedNodes.forEach(localizeTree);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale]);
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Keep the first client render aligned with the server. The saved preference
  // is applied immediately after hydration, avoiding a hydration mismatch.
  const [locale, setLocaleState] = useState<AppLocale>('es-MX');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = stored === 'en-US' || stored === 'es-MX' ? stored : detectBrowserLocale();
    queueMicrotask(() => setLocaleState(initial));
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
      keepalive: true,
    }).catch(() => undefined);
    window.dispatchEvent(new CustomEvent('virafi-locale-change', { detail: next }));
    // A clean render prevents React from reintroducing the previous language
    // into asynchronously rendered dashboard and settings sections.
    window.setTimeout(() => window.location.reload(), 0);
  }, []);

  const value = useMemo(() => ({ locale, setLocale, t: (key: MessageKey) => translate(locale, key) }), [locale, setLocale]);
  useDocumentLocalization(locale);
  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
