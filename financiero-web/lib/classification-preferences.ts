import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoriaFinanciera } from '@/lib/financial-core';
import { applyProfileFilter, withProfile } from '@/lib/tenant-context';

export type PreferenciaClasificacion = {
  categoria: CategoriaFinanciera;
  subcategoria: string;
  matcher: string;
};

function limpiarMatcher(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function normalizarComercioParaPreferencia(concepto: string) {
  const limpio = limpiarMatcher(concepto);

  if (!limpio) return '';

  if (limpio.includes('OXXO')) return 'OXXO*';
  if (limpio.includes('STARBUCKS')) return 'STARBUCKS*';

  return limpio.split(' ').slice(0, 3).join(' ');
}

function matcherCoincide(concepto: string, matcher: string) {
  const conceptoNormalizado = limpiarMatcher(concepto);
  const matcherNormalizado = limpiarMatcher(matcher).replace(/\s*\*\s*$/g, '');

  return Boolean(matcherNormalizado && conceptoNormalizado.includes(matcherNormalizado));
}

export async function buscarPreferenciaClasificacion(
  supabase: SupabaseClient,
  concepto: string,
  profileId?: string | null
): Promise<PreferenciaClasificacion | null> {
  const query = supabase
    .from('classification_preferences')
    .select('matcher, categoria, subcategoria')
    .order('updated_at', { ascending: false })
    .limit(100);
  const { data, error } = await applyProfileFilter(query, profileId);

  if (error) return null;

  const match = ((data || []) as PreferenciaClasificacion[]).find((preferencia) => matcherCoincide(concepto, preferencia.matcher));

  return match || null;
}

export async function guardarPreferenciaClasificacion({
  supabase,
  concepto,
  categoria,
  subcategoria,
  profileId,
}: {
  supabase: SupabaseClient;
  concepto: string;
  categoria: CategoriaFinanciera;
  subcategoria: string;
  profileId?: string | null;
}) {
  const matcher = normalizarComercioParaPreferencia(concepto);

  if (!matcher) return;

  await supabase
    .from('classification_preferences')
    .upsert(
      withProfile({
        matcher,
        categoria,
        subcategoria,
        updated_at: new Date().toISOString(),
      }, profileId),
      { onConflict: profileId ? 'profile_id,matcher' : 'matcher' }
    );
}
