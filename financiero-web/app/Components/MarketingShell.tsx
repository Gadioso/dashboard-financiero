import Link from 'next/link';
import VirafiBrand from '@/app/Components/VirafiBrand';

const navigation = [
  { href: '/producto', label: 'Producto' },
  { href: '/nosotros', label: 'Nosotros' },
  { href: '/seguridad', label: 'Seguridad' },
];

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-nav">
        <Link href="/" aria-label="Virafi, inicio" className="marketing-logo">
          <VirafiBrand compact />
        </Link>
        <nav aria-label="Navegación principal" className="marketing-nav-links">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>
        <div className="marketing-nav-actions">
          <Link href="/login?next=%2Fdashboard" className="marketing-link-button">Iniciar sesión</Link>
          <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Crear cuenta</Link>
        </div>
        <details className="marketing-mobile-menu">
          <summary aria-label="Abrir navegación"><span /><span /><span /></summary>
          <nav aria-label="Navegación móvil">
            {navigation.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
            <Link href="/login?next=%2Fdashboard">Iniciar sesión</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container marketing-footer-grid">
        <div className="marketing-footer-brand">
          <Link href="/" aria-label="Virafi, inicio"><VirafiBrand compact /></Link>
          <p>Tu dinero, con claridad y rumbo.</p>
        </div>
        <div>
          <p className="marketing-footer-title">Producto</p>
          <Link href="/producto">Funciones</Link>
          <Link href="/seguridad">Seguridad</Link>
          <Link href="/login?next=%2Fdashboard">Iniciar sesión</Link>
        </div>
        <div>
          <p className="marketing-footer-title">Compañía</p>
          <Link href="/nosotros">Nosotros</Link>
          <Link href="/nosotros#proposito">Misión y visión</Link>
          <a href="mailto:info@virafi.com">Contacto</a>
        </div>
        <div>
          <p className="marketing-footer-title">Legal</p>
          <Link href="/privacy">Aviso de privacidad</Link>
          <Link href="/terms">Términos y condiciones</Link>
        </div>
        <div className="marketing-footer-meta">
          <p>© 2026 Virafi.</p>
          <a href="mailto:info@virafi.com">info@virafi.com</a>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-site">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
