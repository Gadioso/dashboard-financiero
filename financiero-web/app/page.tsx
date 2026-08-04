import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  ChatCircleDots,
  ClipboardText,
  Flag,
  Lightning,
  LockKey,
  Scales,
  Target,
  UserFocus,
  Wallet,
} from '@phosphor-icons/react/dist/ssr';
import MarketingHeroExperience from '@/app/Components/MarketingHeroExperience';
import MarketingShell from '@/app/Components/MarketingShell';
import MarketingGoalJourneys from '@/app/Components/MarketingGoalJourneys';

export const metadata: Metadata = {
  title: 'Tu CFO personal para cumplir tus metas financieras',
  description: 'Virafi revisa tus números todos los días, detecta desvíos y te guía con acciones concretas para que tus metas financieras sí sucedan.',
};

const dailySteps = [
  { icon: ClipboardText, number: '1', title: 'Revisa', text: 'Ingresos, gastos, aportaciones y pendientes.' },
  { icon: Scales, number: '2', title: 'Decide', text: 'Prioriza el movimiento que más cambia tu rumbo.' },
  { icon: UserFocus, number: '3', title: 'Te acompaña', text: 'Da seguimiento, ajusta el plan y vuelve a insistir.' },
];

const safeguards = [
  { icon: LockKey, title: 'Tus datos, aislados', text: 'Cada perfil consulta únicamente su propia información financiera.' },
  { icon: CheckCircle, title: 'Tú confirmas', text: 'Una recomendación nunca significa que el dinero ya se movió.' },
  { icon: Target, title: 'Sin cifras inventadas', text: 'Si falta un costo o una fecha, Virafi lo dice y pregunta antes de calcular.' },
  { icon: Wallet, title: 'Sin custodiar tu dinero', text: 'Virafi orienta y registra; no recibe, transfiere ni invierte por ti.' },
];

export default function Home() {
  return (
    <MarketingShell>
      <main>
        <MarketingHeroExperience />

        <section className="cfo-promise-strip" aria-label="Lo que hace tu CFO" data-motion-section>
          <div className="marketing-container">
            <h2>Decisiones claras. Progreso real.</h2>
            <div><CheckCircle /><p><strong>Te entiende</strong><span>Conoce tus metas y tu dinero.</span></p></div>
            <div><Lightning /><p><strong>Te guía cada día</strong><span>Te dice qué hacer hoy para avanzar.</span></p></div>
            <div><Flag /><p><strong>Te ayuda a cumplir</strong><span>Ajusta el plan y celebra cada logro.</span></p></div>
          </div>
        </section>

        <section className="marketing-section cfo-proactive" id="como-funciona" data-motion-section>
          <div className="marketing-container">
            <div className="cfo-section-intro">
              <h2>No espera a que preguntes.</h2>
              <p>Tu CFO revisa cada día lo que registraste, compara tu ritmo con tus metas y te busca cuando algo necesita atención.</p>
            </div>
            <div className="cfo-daily-line">
              {dailySteps.map(({ icon: Icon, number, title, text }) => (
                <article key={title}>
                  <span>{number}</span><Icon weight="duotone" />
                  <div><h3>{title}</h3><p>{text}</p></div>
                </article>
              ))}
            </div>
            <div className="cfo-conversation" aria-label="Ejemplo de conversación con el CFO">
              <div><span className="cfo-avatar"><ChatCircleDots weight="duotone" /></span><p><strong>VirafIA</strong> Esta semana conviene apartar $2,750 para tu mudanza.</p></div>
              <div><span className="user-avatar">D</span><p><strong>Tú</strong> ¿De dónde salió?</p></div>
              <div><span className="cfo-avatar"><ChatCircleDots weight="duotone" /></span><p><strong>VirafIA</strong> Es una propuesta provisional. Primero necesito saber en qué ciudad quieres vivir y cuánto pagarías de renta.</p></div>
            </div>
          </div>
        </section>

        <MarketingGoalJourneys />

        <section className="marketing-security-band" data-motion-section>
          <div className="marketing-container">
            <div className="security-band-intro">
              <h2>Inteligente, insistente y siempre bajo tu control.</h2>
              <p>Virafi puede analizar, priorizar y recordarte. Las decisiones con consecuencias financieras siguen siendo tuyas.</p>
              <strong>Virafi no recibe, custodia ni transfiere tu dinero.</strong>
            </div>
            <div className="security-band-list">
              {safeguards.map(({ icon: Icon, title, text }) => (
                <article key={title}><Icon aria-hidden="true" weight="duotone" /><h3>{title}</h3><p>{text}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-cta cfo-final-cta" data-motion-section>
          <div className="marketing-container">
            <div><h2>No necesitas otra app para mirar tus finanzas.<br />Necesitas a alguien que no te deje soltar tus metas.</h2></div>
            <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Quiero mi CFO <ArrowRight /></Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
