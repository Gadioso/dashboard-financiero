"use client";

import Link from 'next/link';
import MarketingShell from '@/app/Components/MarketingShell';
import { useLocale } from '@/app/Components/LocaleProvider';
import { translateUiText } from '@/lib/i18n';

type LegalSection = {
  id: string;
  title: string;
  content: React.ReactNode;
};

type LegalPageProps = {
  title: string;
  description: string;
  updatedAt: string;
  version: string;
  sections: LegalSection[];
  note?: React.ReactNode;
};

export default function LegalPage({ title, description, updatedAt, version, sections, note }: LegalPageProps) {
  const { locale } = useLocale();
  const localized = (value: string) => translateUiText(locale, value);
  return (
    <MarketingShell>
      <main className="legal-page">
        <header className="legal-hero">
          <div className="marketing-container">
            <p className="legal-kicker">{localized('Documento legal · versión')} {version}</p>
            <h1>{localized(title)}</h1>
            <p>{localized(description)}</p>
            <div className="legal-meta"><span>{localized('Última actualización:')} {updatedAt}</span><span>{localized('Idioma aplicable: español')}</span></div>
          </div>
        </header>
        <div className="marketing-container legal-layout">
          <aside aria-label={localized('Contenido del documento')}>
            <p>{localized('Contenido')}</p>
            <nav>{sections.map((section, index) => <a href={`#${section.id}`} key={section.id}>{index + 1}. {localized(section.title)}</a>)}</nav>
            <Link href="/" className="marketing-text-link">{localized('Volver al inicio')}</Link>
          </aside>
          <article className="legal-content">
            {note && <div className="legal-note">{note}</div>}
            {sections.map((section, index) => (
              <section id={section.id} key={section.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h2>{localized(section.title)}</h2>
                <div>{section.content}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </MarketingShell>
  );
}
