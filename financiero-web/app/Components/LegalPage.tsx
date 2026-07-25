import Link from 'next/link';
import MarketingShell from '@/app/Components/MarketingShell';

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
  return (
    <MarketingShell>
      <main className="legal-page">
        <header className="legal-hero">
          <div className="marketing-container">
            <p className="legal-kicker">Documento legal · versión {version}</p>
            <h1>{title}</h1>
            <p>{description}</p>
            <div className="legal-meta"><span>Última actualización: {updatedAt}</span><span>Idioma aplicable: español</span></div>
          </div>
        </header>
        <div className="marketing-container legal-layout">
          <aside aria-label="Contenido del documento">
            <p>Contenido</p>
            <nav>{sections.map((section, index) => <a href={`#${section.id}`} key={section.id}>{index + 1}. {section.title}</a>)}</nav>
            <Link href="/" className="marketing-text-link">Volver al inicio</Link>
          </aside>
          <article className="legal-content">
            {note && <div className="legal-note">{note}</div>}
            {sections.map((section, index) => (
              <section id={section.id} key={section.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h2>{section.title}</h2>
                <div>{section.content}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
    </MarketingShell>
  );
}
