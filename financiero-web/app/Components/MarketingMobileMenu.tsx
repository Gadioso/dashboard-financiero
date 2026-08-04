'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from '@/app/Components/LocaleProvider';

const navigation = [
  { href: '/producto', es: 'Producto', en: 'Product' },
  { href: '/nosotros', es: 'Nosotros', en: 'About us' },
  { href: '/seguridad', es: 'Seguridad', en: 'Security' },
];

export default function MarketingMobileMenu() {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const menuId = `${buttonId}-menu`;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="marketing-mobile-menu">
      <button
        ref={buttonRef}
        type="button"
        className="marketing-mobile-menu-trigger"
        aria-label={locale === 'en-US' ? 'Open navigation' : 'Abrir navegación'}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span /><span /><span />
      </button>
      {open ? (
        <nav id={menuId} aria-label={locale === 'en-US' ? 'Mobile navigation' : 'Navegación móvil'}>
          {navigation.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{locale === 'en-US' ? item.en : item.es}</Link>)}
          <Link href="/login?next=%2Fdashboard" onClick={() => setOpen(false)}>{locale === 'en-US' ? 'Sign in' : 'Iniciar sesión'}</Link>
        </nav>
      ) : null}
    </div>
  );
}
