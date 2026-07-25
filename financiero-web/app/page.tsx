import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bank,
  ChartLineUp,
  CheckCircle,
  LockKey,
  Plant,
  Target,
} from '@phosphor-icons/react/dist/ssr';
import MarketingDashboardPreview from '@/app/Components/MarketingDashboardPreview';
import MarketingShell from '@/app/Components/MarketingShell';

export const metadata: Metadata = {
  title: 'Tu dinero, con claridad y rumbo',
  description: 'Virafi conecta tus finanzas, metas e inversiones para convertir tu información en un plan personalizado y próximos pasos claros.',
};

const capabilities = [
  { icon: Bank, title: 'Flujo diario', text: 'Reúne cuentas y movimientos para entender lo que entra, lo que sale y lo que necesita tu atención.' },
  { icon: Target, title: 'Presupuesto y metas', text: 'Convierte tus ingresos reales en un plan flexible y da seguimiento a las metas que sí importan.' },
  { icon: Plant, title: 'Inversión con propósito', text: 'Relaciona tus metas, horizonte y perfil de riesgo con opciones de inversión y contexto de mercado.' },
  { icon: ChartLineUp, title: 'Agente VirafIA', text: 'El agente VirafIA detecta cambios, anticipa riesgos y te propone el siguiente paso para acercarte a tus metas.' },
];

const process = [
  { number: '1', title: 'Conecta', text: 'Vincula fuentes autorizadas o registra movimientos por web y Telegram.' },
  { number: '2', title: 'Entiende', text: 'Virafi organiza tu información y explica qué está cambiando y por qué.' },
  { number: '3', title: 'Avanza', text: 'Recibe próximos pasos con contexto, límites claros y siempre bajo tu control.' },
];

const safeguards = [
  { icon: LockKey, title: 'Conexiones de solo lectura', text: 'Consultamos información autorizada; no podemos mover dinero ni operar tus cuentas.' },
  { icon: CheckCircle, title: 'Aislamiento por cuenta', text: 'Cada perfil consulta únicamente su propia información financiera.' },
  { icon: ChartLineUp, title: 'Exportación y eliminación', text: 'Puedes obtener una copia de tus datos y solicitar su eliminación desde tu cuenta.' },
  { icon: ArrowRight, title: 'Confirmación antes de actuar', text: 'Las acciones sensibles requieren una decisión explícita de tu parte.' },
];

export default function Home() {
  return (
    <MarketingShell>
      <main>
        <section className="marketing-hero">
          <div className="marketing-container marketing-hero-grid">
            <div className="marketing-hero-copy">
              <h1>Tu dinero,<br />con claridad<br />y rumbo.</h1>
              <p>Virafi conecta tus cuentas, entiende tus metas y convierte cada movimiento en decisiones que te acercan a la vida que quieres construir.</p>
              <div className="marketing-actions">
                <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Crear cuenta</Link>
                <Link href="/producto" className="marketing-button marketing-button-secondary">Conocer Virafi</Link>
              </div>
            </div>
            <MarketingDashboardPreview />
          </div>
          <div className="marketing-rise-line" aria-hidden="true" />
        </section>

        <section className="marketing-section marketing-capabilities">
          <div className="marketing-container">
            <h2>Todo tu panorama financiero,<br />en un mismo lugar.</h2>
            <div className="capability-list">
              {capabilities.map(({ icon: Icon, title, text }) => (
                <article key={title}>
                  <Icon aria-hidden="true" weight="duotone" />
                  <h3>{title}</h3>
                  <span aria-hidden="true" />
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-process">
          <div className="marketing-container">
            <h2>De datos dispersos<br />a decisiones claras.</h2>
            <div className="process-line" aria-hidden="true" />
            <div className="process-list">
              {process.map((step) => (
                <article key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-purpose" id="proposito">
          <div className="marketing-container purpose-grid">
            <div>
              <h2>Tecnología financiera<br />que devuelve el control.</h2>
              <div className="purpose-statements">
                <article>
                  <h3>Nuestra misión</h3>
                  <p>Convertir información financiera compleja en claridad cotidiana y próximos pasos alcanzables.</p>
                </article>
                <article>
                  <h3>Nuestra visión</h3>
                  <p>Que cada persona y negocio en Latinoamérica pueda tomar decisiones financieras con el contexto de un gran equipo a su lado.</p>
                </article>
              </div>
              <Link href="/nosotros" className="marketing-text-link">Conoce nuestro propósito <ArrowRight /></Link>
            </div>
            <div className="purpose-lines" aria-hidden="true"><i /><i /><i /></div>
          </div>
        </section>

        <section className="marketing-security-band">
          <div className="marketing-container">
            <div className="security-band-intro">
              <h2>Tus datos son tuyos.<br />Tu decisión también.</h2>
              <p>Virafi usa tu información para darte contexto y opciones. Tú decides cómo conectarte, qué conservar y cuándo dejar de usar el servicio.</p>
              <strong>Virafi no recibe, custodia ni transfiere tu dinero.</strong>
            </div>
            <div className="security-band-list">
              {safeguards.map(({ icon: Icon, title, text }) => (
                <article key={title}>
                  <Icon aria-hidden="true" weight="duotone" />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-boundaries">
          <div className="marketing-container boundaries-grid">
            <h2>Inteligencia<br />con límites claros.</h2>
            <ul>
              <li>No sustituye asesoría financiera, legal o de inversión profesional.</li>
              <li>Las recomendaciones dependen de la información disponible.</li>
              <li>Tú decides antes de cualquier acción.</li>
            </ul>
          </div>
        </section>

        <section className="marketing-cta">
          <div className="marketing-container">
            <div>
              <h2>Empieza a ver tu dinero con otro rumbo.</h2>
              <p>Crea tu cuenta y construye una visión financiera que crece contigo.</p>
            </div>
            <div className="marketing-actions">
              <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Crear cuenta</Link>
              <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-secondary">Iniciar sesión</Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
