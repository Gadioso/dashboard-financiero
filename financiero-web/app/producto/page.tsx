import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ChartLineUp,
  ChatCircleDots,
  Plant,
  ShieldCheck,
  Target,
} from '@phosphor-icons/react/dist/ssr';
import MarketingDashboardPreview from '@/app/Components/MarketingDashboardPreview';
import MarketingShell from '@/app/Components/MarketingShell';

export const metadata: Metadata = {
  title: 'Producto',
  description: 'Conoce al CFO personal de Virafi: revisa tus finanzas, prioriza acciones y te acompaña proactivamente hasta cumplir tus metas.',
};

const modules = [
  { icon: ChartLineUp, title: 'Revisión financiera diaria', text: 'Tu CFO analiza los movimientos que registras, tu flujo, presupuestos, aportaciones y pendientes para detectar qué requiere atención.' },
  { icon: Target, title: 'Metas convertidas en planes', text: 'Separa metas grandes en etapas, identifica los datos que faltan y propone cuánto apartar sin inventar el costo del objetivo.' },
  { icon: ChatCircleDots, title: 'Conversación con criterio', text: 'Entiende preguntas de seguimiento, explica de dónde sale cada cifra y usa tu contexto personal para priorizar.' },
  { icon: Plant, title: 'Acompañamiento proactivo', text: 'No espera a que abras el dashboard: te avisa, vuelve a revisar y da seguimiento al siguiente paso acordado.' },
  { icon: ChartLineUp, title: 'Inversión ligada al propósito', text: 'Separa el dinero de corto plazo del capital de largo plazo y filtra alternativas según horizonte, liquidez y perfil de riesgo.' },
  { icon: ShieldCheck, title: 'Confirmación antes de actuar', text: 'Virafi recomienda y registra. Ninguna aportación, operación o decisión sensible ocurre sin una confirmación explícita.' },
];

export default function ProductPage() {
  return (
    <MarketingShell>
      <main>
        <section className="marketing-page-hero">
          <div className="marketing-container marketing-page-hero-grid">
            <div>
              <h1>Un CFO que trabaja todos los días para tus metas.</h1>
              <p>Virafi entiende tu situación, decide qué merece atención y convierte tus números en una acción concreta. Después vuelve para comprobar que avances.</p>
              <div className="marketing-actions">
                <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Quiero mi CFO</Link>
                <Link href="/seguridad" className="marketing-button marketing-button-secondary">Cómo cuidamos tus datos</Link>
              </div>
            </div>
            <div className="page-hero-note">
              <ChartLineUp weight="duotone" />
              <p><strong>No es un chatbot que espera órdenes.</strong> Es un sistema financiero proactivo que revisa, razona, explica y te acompaña con el mismo contexto todos los días.</p>
            </div>
          </div>
        </section>

        <section className="marketing-section product-preview-section">
          <div className="marketing-container"><MarketingDashboardPreview /></div>
        </section>

        <section className="marketing-section product-modules">
          <div className="marketing-container">
            <div className="marketing-section-heading">
              <h2>De lo que hiciste hoy<br />a la vida que quieres construir.</h2>
              <p>Cada parte del producto alimenta al mismo CFO. El objetivo no es mostrar más gráficas, sino producir mejores decisiones y sostenerlas en el tiempo.</p>
            </div>
            <div className="module-list">
              {modules.map(({ icon: Icon, title, text }, index) => (
                <article key={title}>
                  <span className="module-number">0{index + 1}</span>
                  <Icon aria-hidden="true" weight="duotone" />
                  <div><h3>{title}</h3><p>{text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-security-band product-principles">
          <div className="marketing-container">
            <div className="security-band-intro">
              <h2>Proactivo no significa fuera de control.</h2>
              <p>El CFO puede investigar, priorizar, explicar e insistir. Las decisiones con consecuencias financieras permanecen bajo tu control.</p>
            </div>
            <div className="product-principle-list">
              <p><ShieldCheck /> Tus datos se mantienen aislados por perfil y se usan para tu propio plan.</p>
              <p><Target /> Recomendaciones ligadas a tus metas, liquidez y tolerancia al riesgo.</p>
              <p><ChartLineUp /> Evidencia, contexto de mercado y límites visibles para revisar cada sugerencia.</p>
            </div>
          </div>
        </section>

        <section className="marketing-cta">
          <div className="marketing-container">
            <div><h2>Deja de cargar tus metas tú solo.</h2><p>Dale contexto a Virafi y recibe un plan que se revisa contigo cada día.</p></div>
            <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Quiero mi CFO <ArrowRight /></Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
