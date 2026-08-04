'use client';

import { ChatCircleDots, Wallet } from '@phosphor-icons/react';
import { useLocale } from '@/app/Components/LocaleProvider';

const goals = {
  'es-MX': [
    { number: '01', title: 'Independizarme y viajar', amount: '$2,750 al mes', stages: ['Mudanza', 'Colchón de transición', 'Primer viaje'], question: '¿En qué ciudad quieres vivir y cuánto pagarías de renta?' },
    { number: '02', title: 'Comprar una propiedad', amount: '$1,650 al mes', stages: ['Precio y ciudad', 'Enganche y gastos', 'Mensualidad sostenible'], question: '¿Sería para vivir o invertir?' },
  ],
  'en-US': [
    { number: '01', title: 'Move out and travel', amount: '$2,750 per month', stages: ['Moving', 'Transition cushion', 'First trip'], question: 'Which city do you want to live in and how much rent would you pay?' },
    { number: '02', title: 'Buy a property', amount: '$1,650 per month', stages: ['Price and city', 'Down payment and costs', 'Sustainable payment'], question: 'Would it be to live in or invest?' },
  ],
};

export default function MarketingGoalJourneys() {
  const { locale } = useLocale();
  const copy = locale === 'en-US'
    ? { title: 'Your goals stop being wishes.', text: 'Virafi turns what you want to live into a plan with priorities, stages, and a concrete amount for today.', suggested: 'Suggested contribution:' }
    : { title: 'Tus metas dejan de ser deseos.', text: 'Virafi convierte lo que quieres vivir en un plan con prioridades, etapas y una cantidad concreta para hoy.', suggested: 'Apartado sugerido:' };
  return (
    <section className="marketing-section cfo-goals" id="metas-financieras" data-motion-section data-no-translate>
      <div className="marketing-container">
        <div className="cfo-section-intro centered"><h2>{copy.title}</h2><p>{copy.text}</p></div>
        <div className="goal-journey-list">
          {goals[locale].map((goal) => <article key={goal.number}>
            <span className="goal-journey-number">{goal.number}</span>
            <div className="goal-journey-content"><h3>{goal.title}</h3>
              <div className="goal-stage-line">{goal.stages.map((stage, index) => <span key={stage}><i>{index + 1}</i>{stage}</span>)}</div>
              <div className="goal-journey-detail"><p><Wallet weight="duotone" /> {copy.suggested} <strong>{goal.amount}</strong></p><p><ChatCircleDots weight="duotone" /> {goal.question}</p></div>
            </div>
          </article>)}
        </div>
      </div>
    </section>
  );
}
