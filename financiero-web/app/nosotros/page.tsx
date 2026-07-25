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
  { icon: Heart, title: 'Tecnología al servicio de la persona', text: 'La automatización debe reducir carga mental y ampliar capacidad de decisión, no reemplazar el criterio del usuario.' },
  { icon: Eye, title: 'Límites visibles', text: 'Explicamos qué sabemos, qué inferimos, qué falta y cuándo conviene recurrir a un especialista.' },
  { icon: Scales, title: 'Progreso responsable', text: 'Priorizamos estabilidad, contexto y pasos sostenibles sobre promesas rápidas o rendimientos garantizados.' },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <main>
        <section className="marketing-page-hero about-hero">
          <div className="marketing-container">
            <h1>Las finanzas no deberían sentirse como un idioma ajeno.</h1>
            <p>Virafi nace de una idea sencilla: cuando la información financiera está conectada, explicada y puesta en contexto, las personas y los negocios pueden decidir con más calma y dirección.</p>
          </div>
        </section>

        <section className="marketing-section about-purpose" id="proposito">
          <div className="marketing-container">
            <article>
              <span>01</span>
              <div><h2>Nuestra misión</h2><p>Convertir información financiera compleja en claridad cotidiana y próximos pasos alcanzables.</p></div>
            </article>
            <article>
              <span>02</span>
              <div><h2>Nuestra visión</h2><p>Que cada persona y negocio en Latinoamérica pueda tomar decisiones financieras con el contexto de un gran equipo a su lado.</p></div>
            </article>
          </div>
        </section>

        <section className="marketing-section about-story">
          <div className="marketing-container about-story-grid">
            <h2>De dashboard personal a plataforma de inteligencia financiera.</h2>
            <div>
              <p>Virafi comenzó organizando el flujo cotidiano con una regla simple: dar un propósito claro a cada parte del ingreso. Esa base creció hacia un sistema que integra cuentas, metas, patrimonio, mercados y conversación financiera.</p>
              <p>La siguiente etapa no consiste en añadir más pantallas. Consiste en coordinar especialistas digitales que compartan contexto y ayuden a personas, freelancers, creadores y pequeñas empresas a entender qué requiere atención.</p>
              <p>Seguimos construyendo desde México para Latinoamérica, con una arquitectura pensada para la realidad regional: ingresos variables, múltiples cuentas, distintos horizontes de vida y necesidad de explicaciones financieras sin tecnicismos.</p>
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
            <div><h2>Un mejor rumbo empieza con una vista más clara.</h2><p>Conoce el producto o escríbenos para conversar.</p></div>
            <div className="marketing-actions"><Link href="/producto" className="marketing-button marketing-button-primary">Ver producto</Link><a href="mailto:info@virafi.com" className="marketing-button marketing-button-secondary">Contacto <ArrowRight /></a></div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
