'use client';

import Link from 'next/link';
import { AirplaneTilt, Compass, House, ShieldCheck } from '@phosphor-icons/react';
import { useRef } from 'react';
import type { PointerEvent } from 'react';
import MarketingDashboardPreview from '@/app/Components/MarketingDashboardPreview';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export default function MarketingHeroExperience() {
  const heroRef = useRef<HTMLElement>(null);

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch') return;
    const hero = heroRef.current;
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) - 0.5;
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) - 0.5;
    hero.style.setProperty('--pointer-x', x.toFixed(3));
    hero.style.setProperty('--pointer-y', y.toFixed(3));
  };

  const resetPointer = () => {
    const hero = heroRef.current;
    if (!hero) return;
    hero.style.setProperty('--pointer-x', '0');
    hero.style.setProperty('--pointer-y', '0');
  };

  return (
    <section
      ref={heroRef}
      className="immersive-hero"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      aria-labelledby="virafi-hero-title"
    >
      <div className="marketing-container immersive-hero-stage">
        <div className="marketing-hero-copy immersive-hero-copy">
          <h1 id="virafi-hero-title">Tu CFO personal.<br />Todos los días,<br />hasta cumplir<br />tus metas.</h1>
          <p>Virafi revisa tus números, detecta desvíos y te dice qué hacer hoy para que tus metas sí sucedan.</p>
          <div className="marketing-actions">
            <Link href="/login?next=%2Fdashboard" className="marketing-button marketing-button-primary">Quiero mi CFO</Link>
            <Link href="#como-funciona" className="marketing-button marketing-button-secondary">Ver cómo funciona</Link>
          </div>
        </div>

        <div className="immersive-dashboard" aria-label="Vista del plan financiero de Virafi">
          <MarketingDashboardPreview />
        </div>
      </div>

      <div className="immersive-landscape" aria-hidden="true">
        <div className="immersive-route-highlight" />
      </div>

      <div className="immersive-waypoint waypoint-home" aria-hidden="true"><House weight="duotone" /></div>
      <div className="immersive-waypoint waypoint-travel" aria-hidden="true"><AirplaneTilt weight="duotone" /></div>
      <div className="immersive-waypoint waypoint-compass" aria-hidden="true"><Compass weight="duotone" /></div>
      <div className="immersive-waypoint waypoint-safety" aria-hidden="true"><ShieldCheck weight="duotone" /></div>
    </section>
  );
}
