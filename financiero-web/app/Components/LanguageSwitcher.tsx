'use client';

import { AppLocale } from '@/lib/i18n';
import { useLocale } from './LocaleProvider';

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <label data-no-translate className={`inline-flex items-center gap-2 text-xs font-bold text-slate-500 ${compact ? '' : 'rounded-lg border border-slate-200 bg-white px-3 py-2'}`}>
      <span>{t('language')}</span>
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
        className="cursor-pointer bg-transparent text-slate-700 outline-none"
      >
        <option value="es-MX">{t('spanish')}</option>
        <option value="en-US">{t('english')}</option>
      </select>
    </label>
  );
}
