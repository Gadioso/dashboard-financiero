'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppLocale, detectBrowserLocale, localeFromCountry, MessageKey, translate, translateUiText } from '@/lib/i18n';

type LocaleContextValue = { locale: AppLocale; setLocale: (locale: AppLocale) => void; t: (key: MessageKey) => string };
const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = 'virafi-locale';

const routeTitles: Record<string, Record<AppLocale, string>> = {
  '/': { 'es-MX': 'Tu CFO personal para cumplir tus metas financieras', 'en-US': 'Your personal CFO for reaching your financial goals' },
  '/producto': { 'es-MX': 'Producto | Virafi', 'en-US': 'Product | Virafi' },
  '/nosotros': { 'es-MX': 'Nosotros | Virafi', 'en-US': 'About | Virafi' },
  '/seguridad': { 'es-MX': 'Seguridad y control | Virafi', 'en-US': 'Security and control | Virafi' },
  '/privacy': { 'es-MX': 'Aviso de privacidad integral | Virafi', 'en-US': 'Comprehensive Privacy Notice | Virafi' },
  '/terms': { 'es-MX': 'Términos y condiciones | Virafi', 'en-US': 'Terms and Conditions | Virafi' },
  '/login': { 'es-MX': 'Iniciar sesión | Virafi', 'en-US': 'Sign in | Virafi' },
  '/onboarding': { 'es-MX': 'Configuración | Virafi', 'en-US': 'Settings | Virafi' },
  '/dashboard': { 'es-MX': 'Dashboard | Virafi', 'en-US': 'Dashboard | Virafi' },
  '/auth/update-password': { 'es-MX': 'Actualizar contraseña | Virafi', 'en-US': 'Update password | Virafi' },
};

const routeDescriptions: Partial<Record<string, Record<AppLocale, string>>> = {
  '/': {
    'es-MX': 'Virafi revisa tus números todos los días, detecta desvíos y te guía con acciones concretas para que tus metas financieras sí sucedan.',
    'en-US': 'Virafi reviews your numbers every day, spots deviations, and guides you with concrete actions so your financial goals happen.',
  },
  '/producto': {
    'es-MX': 'Conoce al CFO personal de Virafi: revisa tus finanzas, prioriza acciones y te acompaña proactivamente hasta cumplir tus metas.',
    'en-US': 'Meet Virafi’s personal CFO: it reviews your finances, prioritizes actions, and proactively supports you until you reach your goals.',
  },
  '/nosotros': {
    'es-MX': 'Conoce la misión, visión y principios que guían a Virafi.',
    'en-US': 'Learn about the mission, vision, and principles that guide Virafi.',
  },
  '/seguridad': {
    'es-MX': 'Conoce los controles de acceso, aislamiento, cifrado, auditoría y privacidad de Virafi.',
    'en-US': 'Learn about Virafi’s access, isolation, encryption, auditing, and privacy controls.',
  },
  '/privacy': {
    'es-MX': 'Aviso de privacidad integral de Virafi: datos tratados, finalidades, proveedores, seguridad y derechos ARCO.',
    'en-US': 'Virafi Comprehensive Privacy Notice: data processed, purposes, providers, security, and ARCO rights.',
  },
  '/terms': {
    'es-MX': 'Términos y condiciones de uso de Virafi.',
    'en-US': 'Virafi Terms and Conditions of Use.',
  },
};

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
      const storedSource = originalText.current.get(node);
      const storedOutput = storedSource === undefined
        ? undefined
        : locale === 'en-US' ? translateUiText(locale, storedSource) : storedSource;
      const source = storedSource !== undefined && node.data !== storedSource && node.data !== storedOutput
        ? node.data
        : storedSource ?? node.data;
      originalText.current.set(node, source);
      const next = locale === 'en-US' ? translateUiText(locale, source) : source;
      if (node.data !== next) node.data = next;
    };
    const localizeElement = (element: Element) => {
      if (element.closest('script, style, code, pre, [data-no-translate]')) return;
      let attributes = originalAttributes.current.get(element);
      for (const attribute of translatableAttributes) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        if (!attributes) {
          attributes = new Map();
          originalAttributes.current.set(element, attributes);
        }
        const storedSource = attributes.get(attribute);
        const storedOutput = storedSource === undefined
          ? undefined
          : locale === 'en-US' ? translateUiText(locale, storedSource) : storedSource;
        const source = storedSource !== undefined && current !== storedSource && current !== storedOutput
          ? current
          : storedSource ?? current;
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
        if (mutation.type === 'attributes') localizeElement(mutation.target as Element);
      }
    });
    observer.observe(document.body, {
      attributeFilter: [...translatableAttributes],
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [locale]);
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Keep the first client render aligned with the server. The saved preference
  // is applied immediately after hydration, avoiding a hydration mismatch.
  const [locale, setLocaleState] = useState<AppLocale>('es-MX');
  const pathname = usePathname();

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

  useEffect(() => {
    const expectedTitle = routeTitles[pathname]?.[locale] ?? 'Virafi';
    const expectedDescription = routeDescriptions[pathname]?.[locale];
    const syncHead = () => {
      if (document.title !== expectedTitle) document.title = expectedTitle;
      if (expectedDescription) {
        document.head.querySelectorAll<HTMLMetaElement>('meta[name="description"]').forEach((description) => {
          if (description.content !== expectedDescription) description.content = expectedDescription;
        });
      }
    };
    syncHead();
    const observer = new MutationObserver(syncHead);
    observer.observe(document.head, { attributes: true, attributeFilter: ['content'], childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [locale, pathname]);

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
