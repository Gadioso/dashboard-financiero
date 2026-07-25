import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bank,
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
  description: 'Conoce cómo Virafi conecta cuentas, metas, patrimonio, mercados e inteligencia financiera en una sola experiencia.',
};

const modules = [
  { icon: Bank, title: 'Cuentas y movimientos', text: 'Centraliza información bancaria de solo lectura, movimientos capturados en web y registros conversacionales por Telegram.' },
  { icon: Target, title: 'Presupuesto y metas', text: 'Parte de tus ingresos reales y adapta la regla 33/33/33 a tus prioridades, obligaciones y etapa financiera.' },
  { icon: ChatCircleDots, title: 'Agente VirafIA', text: 'Pregunta cómo vas, qué cambió o cuál debería ser tu siguiente paso usando el contexto de tu propio panorama.' },
  { icon: Plant, title: 'Patrimonio y escenarios', text: 'Conoce tu posición, capacidad de aportación y exposición antes de tomar una decisión; Virafi no custodia activos.' },
  { icon: ChartLineUp, title: 'Mercados e inversión', text: 'Consulta contexto de mercado y explora opciones compatibles con tus metas, horizonte, liquidez y perfil de riesgo.' },
  { icon: Target, title: 'Agente proactivo', text: 'VirafIA monitorea tu avance, detecta desvíos y convierte cada hallazgo en un siguiente paso concreto.' },
];

export default function ProductPage() {
  return (
    <MarketingShell>
      <main>
        <section className="marketing-page-hero">
          <div className="marketing-container marketing-page-hero-grid">
            <div>
              <h1>Un sistema financiero que entiende el panorama completo.</h1>
              <p>Virafi reúne lo que normalmente vive separado —cuentas, movimientos, metas, patrimonio y mercados— para convertirlo en un plan coherente y próximos pasos concretos.</p>
              <div className="marketing-actions">
                <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Probar Virafi</Link>
                <Link href="/seguridad" className="marketing-button marketing-button-secondary">Cómo cuidamos tus datos</Link>
              </div>
            </div>
            <div className="page-hero-note">
              <ChartLineUp weight="duotone" />
              <p><strong>Una sola conversación.</strong> Distintos especialistas financieros trabajan con el mismo contexto, sin obligarte a traducir tus finanzas entre herramientas.</p>
            </div>
          </div>
        </section>

        <section className="marketing-section product-preview-section">
          <div className="marketing-container"><MarketingDashboardPreview /></div>
        </section>

        <section className="marketing-section product-modules">
          <div className="marketing-container">
            <div className="marketing-section-heading">
              <h2>De la operación diaria<br />a la visión de largo plazo.</h2>
              <p>Cada módulo aporta contexto al siguiente. El objetivo no es mostrar más datos, sino ayudarte a decidir mejor.</p>
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
              <h2>Diseñado para informar antes de actuar.</h2>
              <p>La automatización organiza, detecta y explica. Las decisiones con consecuencias financieras permanecen bajo tu control.</p>
            </div>
            <div className="product-principle-list">
              <p><ShieldCheck /> Integraciones en modo de consulta cuando la función no requiere escritura.</p>
              <p><Target /> Recomendaciones ligadas a tus metas, liquidez y tolerancia al riesgo.</p>
              <p><ChartLineUp /> Evidencia, contexto de mercado y límites visibles para revisar cada sugerencia.</p>
            </div>
          </div>
        </section>

        <section className="marketing-cta">
          <div className="marketing-container">
            <div><h2>Construye tu panorama financiero.</h2><p>Empieza con lo que ya tienes y agrega contexto a tu ritmo.</p></div>
            <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Crear cuenta <ArrowRight /></Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
