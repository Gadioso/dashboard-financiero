'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);
const staggerReveal = (progress: number, index: number) => {
  const delay = Math.min(index * 0.04, 0.28);
  return smoothstep(clamp((progress - delay) / (1 - delay)));
};

const motionGroupSelector = [
  '.cfo-daily-line',
  '.data-control-list',
  '.goal-journey-list',
  '.module-list',
  '.principle-list',
  '.product-principle-list',
  '.security-band-list',
  '.security-layer-list',
].join(',');

type MotionItem = {
  element: HTMLElement;
  current: number;
};

type MotionSection = {
  element: HTMLElement;
  items: MotionItem[];
  currentTravel: number;
};

export default function MarketingMotionController() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const site = document.querySelector<HTMLElement>('.marketing-site');
    const main = document.querySelector<HTMLElement>('.marketing-site main');
    if (!site || !main) return;

    const sectionElements = Array.from(
      site.querySelectorAll<HTMLElement>('main > section, main > header, main > .marketing-container, .legal-content > section, .marketing-footer'),
    ).filter((section) => !section.classList.contains('immersive-hero'));

    const sections: MotionSection[] = sectionElements.map((section) => {
      if (!section.hasAttribute('data-motion-section')) section.dataset.motionSection = 'auto';

      const content = section.matches('.marketing-container')
        ? section
        : section.querySelector<HTMLElement>(':scope > .marketing-container');
      const directItems = Array.from((content ?? section).children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      );
      const itemElements = directItems.flatMap((element) => (
        element.matches(motionGroupSelector)
          ? Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
          : [element]
      ));
      const rect = section.getBoundingClientRect();
      const initialProgress = clamp((window.innerHeight * 0.94 - rect.top) / (window.innerHeight * 0.46));

      const items = itemElements.map((element, index) => {
        const current = staggerReveal(initialProgress, index);
        element.dataset.motionItem = 'true';
        element.style.setProperty('--motion-reveal', current.toFixed(4));
        return { element, current };
      });

      return { element: section, items, currentTravel: 0.5 };
    });

    const hero = main.querySelector<HTMLElement>('.immersive-hero');
    let heroProgress = 0;
    let heroEntry = hero ? clamp((window.innerHeight - hero.getBoundingClientRect().top) / window.innerHeight) : 1;
    let frame = 0;
    let lastTime = performance.now();
    let routeFrame = 0;

    const update = (time: number) => {
      frame = 0;
      const viewportHeight = window.innerHeight;
      const elapsed = Math.min(Math.max(time - lastTime, 8), 48);
      const easing = 1 - Math.exp(-elapsed / 82);
      lastTime = time;
      let unsettled = false;

      sections.forEach((section) => {
        const rect = section.element.getBoundingClientRect();
        const revealProgress = clamp((viewportHeight * 0.94 - rect.top) / (viewportHeight * 0.46));
        const travel = clamp(
          (viewportHeight - rect.top) / Math.max(viewportHeight + rect.height, 1),
        );
        section.currentTravel += (travel - section.currentTravel) * easing;
        const parallax = (section.currentTravel - 0.5) * 2;

        section.element.style.setProperty('--section-travel', section.currentTravel.toFixed(4));
        section.element.style.setProperty('--section-parallax', parallax.toFixed(4));
        section.items.forEach((item, index) => {
          const target = staggerReveal(revealProgress, index);
          item.current += (target - item.current) * easing;
          item.element.style.setProperty('--motion-reveal', item.current.toFixed(4));
          if (Math.abs(target - item.current) > 0.001) unsettled = true;
        });
      });

      if (hero) {
        const rect = hero.getBoundingClientRect();
        const travelDistance = Math.max(rect.height - viewportHeight * 0.18, 1);
        const targetProgress = smoothstep(clamp(-rect.top / travelDistance));
        const targetEntry = smoothstep(clamp((viewportHeight - rect.top) / viewportHeight));
        heroProgress += (targetProgress - heroProgress) * easing;
        heroEntry += (targetEntry - heroEntry) * easing;
        const routeProgress = clamp(0.32 + heroProgress * 0.68);

        hero.style.setProperty('--hero-scroll', heroProgress.toFixed(4));
        hero.style.setProperty('--hero-entry', heroEntry.toFixed(4));
        hero.style.setProperty('--route-reveal', `${((1 - routeProgress) * 100).toFixed(2)}%`);
        if (Math.abs(targetProgress - heroProgress) > 0.001 || Math.abs(targetEntry - heroEntry) > 0.001) {
          unsettled = true;
        }
      }

      if (unsettled) frame = window.requestAnimationFrame(update);
    };

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    root.dataset.marketingMotion = 'ready';
    root.dataset.marketingRoute = 'enter';
    routeFrame = window.requestAnimationFrame(() => {
      routeFrame = window.requestAnimationFrame(() => {
        root.dataset.marketingRoute = 'ready';
      });
    });
    requestUpdate();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (routeFrame) window.cancelAnimationFrame(routeFrame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      delete root.dataset.marketingMotion;
      delete root.dataset.marketingRoute;
      sections.forEach((section) => {
        section.element.style.removeProperty('--section-travel');
        section.element.style.removeProperty('--section-parallax');
        if (section.element.dataset.motionSection === 'auto') delete section.element.dataset.motionSection;
        section.items.forEach(({ element }) => {
          element.style.removeProperty('--motion-reveal');
          delete element.dataset.motionItem;
        });
      });
    };
  }, [pathname]);

  return null;
}
