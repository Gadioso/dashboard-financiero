import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Compass, Eye, Heart, Scales } from '@phosphor-icons/react/dist/ssr';
import MarketingShell from '@/app/Components/MarketingShell';

export const metadata: Metadata = {
  title: 'Nosotros',
  description: 'Conoce la misión, visión y principios que guían a Virafi.',
};

const principles = [
  { icon: Compass, title: 'Claridad antes que complejidad', text: 'Traducimos datos, escenarios y lenguaje financiero en decisiones que una persona puede entender y revisar.' },
  { icon: Heart, title: 'Acompañamiento, no abandono', text: 'La inteligencia debe reducir carga mental, proponer el siguiente paso y volver para comprobar si la persona pudo avanzar.' },
  { icon: Eye, title: 'Límites visibles', text: 'Explicamos qué sabemos, qué inferimos, qué falta y cuándo conviene recurrir a un especialista.' },
  { icon: Scales, title: 'Progreso responsable', text: 'Priorizamos estabilidad, contexto y pasos sostenibles sobre promesas rápidas o rendimientos garantizados.' },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <main>
        <section className="marketing-page-hero about-hero">
          <div className="marketing-container">
            <h1>Nadie debería perseguir sus metas financieras solo.</h1>
            <p>Virafi nace de una idea sencilla: entender tus números no basta. Hace falta convertirlos en decisiones, sostener el plan y tener a alguien que te recuerde por qué empezaste.</p>
          </div>
        </section>

        <section className="marketing-section about-purpose" id="proposito">
          <div className="marketing-container">
            <article>
              <span>01</span>
              <div><h2>Nuestra misión</h2><p>Dar a cada persona un CFO proactivo que convierta sus metas de vida en decisiones financieras alcanzables.</p></div>
            </article>
            <article>
              <span>02</span>
              <div><h2>Nuestra visión</h2><p>Que cada persona en Latinoamérica tenga el criterio, seguimiento y claridad financiera que antes sólo tenía quien podía pagar un gran equipo.</p></div>
            </article>
          </div>
        </section>

        <section className="marketing-section about-story">
          <div className="marketing-container about-story-grid">
            <h2>De dashboard personal a CFO que trabaja contigo.</h2>
            <div>
              <p>Virafi comenzó organizando el flujo cotidiano con una regla simple: dar un propósito claro a cada parte del ingreso. Esa base creció hacia un sistema que entiende metas, hábitos, prioridades y decisiones financieras.</p>
              <p>La siguiente etapa no consiste en añadir más pantallas. Consiste en construir un CFO que revise cada día, detecte desvíos, explique sus recomendaciones y acompañe a la persona hasta cerrar la distancia entre intención y resultado.</p>
              <p>Seguimos construyendo desde México para Latinoamérica, con una arquitectura pensada para ingresos variables, metas que cambian, distintas filosofías de vida y la necesidad de explicaciones sin tecnicismos.</p>
            </div>
          </div>
        </section>

        <section className="marketing-section about-principles">
          <div className="marketing-container">
            <div className="marketing-section-heading"><h2>Principios que nos dan rumbo.</h2><p>El producto evoluciona; estos criterios no deberían hacerlo.</p></div>
            <div className="principle-list">
              {principles.map(({ icon: Icon, title, text }) => (
                <article key={title}><Icon weight="duotone" /><div><h3>{title}</h3><p>{text}</p></div></article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-cta">
          <div className="marketing-container">
            <div><h2>Un mejor rumbo empieza con alguien que te acompañe.</h2><p>Conoce a tu CFO personal o escríbenos para conversar.</p></div>
            <div className="marketing-actions"><Link href="/producto" className="marketing-button marketing-button-primary">Ver producto</Link><a href="mailto:info@virafi.com" className="marketing-button marketing-button-secondary">Contacto <ArrowRight /></a></div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
