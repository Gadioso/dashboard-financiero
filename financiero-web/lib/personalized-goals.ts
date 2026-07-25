import type { SupabaseClient } from '@supabase/supabase-js';

type Personalization = {
  short_term_goals?: string[] | null;
  medium_term_goals?: string[] | null;
  long_term_goals?: string[] | null;
  goal_priorities?: string[] | null;
  monthly_goal_capacity?: number | string | null;
};

const LIFE_PRIORITY_ONLY = new Set([
  'dios', 'fe', 'familia', 'trabajo', 'salud', 'amor', 'felicidad', 'placeres',
]);

function normalizedName(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es-MX');
}

/** A life value is useful context, but is not itself a fundable financial goal. */
export function isConcreteFinancialGoal(value: unknown) {
  const normalized = normalizedName(value).replace(/[.!?]+$/g, '').trim();
  return Boolean(normalized) && !LIFE_PRIORITY_ONLY.has(normalized);
}

function uniqueGoals(profile: Personalization) {
  // Priorities describe the person's values. Only explicit outcomes become goals.
  const all = [...(profile.short_term_goals || []), ...(profile.medium_term_goals || []), ...(profile.long_term_goals || [])];
  const unique = new Map<string, string>();
  for (const goal of all) {
    const name = String(goal).trim();
    const normalized = normalizedName(name);
    if (isConcreteFinancialGoal(name) && !unique.has(normalized)) unique.set(normalized, name);
  }
  return [...unique.values()].slice(0, 4);
}

function horizonMonths(goal: string, profile: Personalization) {
  if ((profile.short_term_goals || []).includes(goal)) return 12;
  if ((profile.medium_term_goals || []).includes(goal)) return 36;
  return 60;
}

export async function syncPersonalizedGoals({ supabase, profileId, personalization }: { supabase: SupabaseClient; profileId: string; personalization: Personalization }) {
  const names = uniqueGoals(personalization);
  if (!names.length) {
    const [{ error: goalsError }, { error: settingsError }] = await Promise.all([
      supabase
      .from('financial_goals')
      .delete()
      .eq('profile_id', profileId)
      .eq('source', 'personalization'),
      supabase
      .from('advisor_disclosures')
      .delete()
      .eq('profile_id', profileId)
      .eq('disclosure_type', 'personalized_advice')
      .eq('version', 'financial-goals-v1'),
    ]);
    if (goalsError || settingsError) throw new Error(`No pude actualizar tus metas: ${goalsError?.message || settingsError?.message}`);
    return { generated: 0 };
  }
  const { data: existing, error: existingError } = await supabase
    .from('financial_goals')
    .select('id, name, current_amount, target_amount, target_date')
    .eq('profile_id', profileId)
    .eq('source', 'personalization');
  if (existingError) throw new Error(`No pude leer tus metas: ${existingError.message}`);
  const byName = new Map((existing || []).map((row) => [normalizedName(row.name), row]));
  const now = new Date().toISOString();
  const rows = names.map((name, index) => {
    const months = horizonMonths(name, personalization);
    const previous = byName.get(normalizedName(name));
    const targetDate = new Date(); targetDate.setMonth(targetDate.getMonth() + months);
    return {
      profile_id: profileId,
      name,
      current_amount: Number(previous?.current_amount || 0),
      // Monthly capacity constrains the plan; it is not the invented price of a goal.
      target_amount: Number(previous?.target_amount || 0),
      target_date: previous?.target_date || targetDate.toISOString().slice(0, 10),
      horizon_months: months,
      source: 'personalization',
      status: 'active',
      sort_order: index,
      updated_at: now,
    };
  });
  const { data: saved, error: saveError } = await supabase
    .from('financial_goals')
    .upsert(rows, { onConflict: 'profile_id,name' })
    .select('id, name, target_amount, target_date');
  if (saveError) throw new Error(`No pude crear tus metas: ${saveError.message}`);

  const savedIds = (saved || []).map((goal) => String(goal.id));
  if (savedIds.length) {
    const { error: staleError } = await supabase
      .from('financial_goals')
      .delete()
      .eq('profile_id', profileId)
      .eq('source', 'personalization')
      .not('id', 'in', `(${savedIds.join(',')})`);
    if (staleError) throw new Error(`No pude depurar metas anteriores: ${staleError.message}`);
  }

  const goals = Object.fromEntries((saved || []).map((goal) => [String(goal.id), {
    target: Number(goal.target_amount || 0),
    targetDate: goal.target_date || null,
    source: 'personalization',
  }]));
  const { error: metadataError } = await supabase.from('advisor_disclosures').upsert({ profile_id: profileId, disclosure_type: 'personalized_advice', version: 'financial-goals-v1', accepted_at: now, metadata: { goals, generatedGoalIds: savedIds } }, { onConflict: 'profile_id,disclosure_type,version' });
  if (metadataError) throw new Error(`No pude configurar las metas personalizadas: ${metadataError.message}`);
  return { generated: names.length };
}
