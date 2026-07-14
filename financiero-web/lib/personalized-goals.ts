import type { SupabaseClient } from '@supabase/supabase-js';

type Personalization = {
  short_term_goals?: string[] | null;
  medium_term_goals?: string[] | null;
  long_term_goals?: string[] | null;
  goal_priorities?: string[] | null;
  monthly_goal_capacity?: number | string | null;
};

function uniqueGoals(profile: Personalization) {
  const prioritized = profile.goal_priorities || [];
  const all = [...prioritized, ...(profile.short_term_goals || []), ...(profile.medium_term_goals || []), ...(profile.long_term_goals || [])];
  const unique = new Map<string, string>();
  for (const goal of all) {
    const name = String(goal).trim();
    if (name && !unique.has(name.toLocaleLowerCase('es-MX'))) unique.set(name.toLocaleLowerCase('es-MX'), name);
  }
  return [...unique.values()].slice(0, 6);
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
  const monthlyCapacity = Math.max(Number(personalization.monthly_goal_capacity || 0), 0);
  const { data: existing, error: existingError } = await supabase
    .from('financial_goals')
    .select('id, name, current_amount')
    .eq('profile_id', profileId)
    .eq('source', 'personalization');
  if (existingError) throw new Error(`No pude leer tus metas: ${existingError.message}`);
  const byName = new Map((existing || []).map((row) => [String(row.name).trim().toLocaleLowerCase('es-MX'), row]));
  const now = new Date().toISOString();
  const rows = names.map((name, index) => {
    const months = horizonMonths(name, personalization);
    const target = monthlyCapacity > 0 ? Math.round((monthlyCapacity * months) / Math.max(names.length, 1)) : 0;
    const targetDate = new Date(); targetDate.setMonth(targetDate.getMonth() + months);
    return {
      profile_id: profileId,
      name,
      current_amount: Number(byName.get(name.toLocaleLowerCase('es-MX'))?.current_amount || 0),
      target_amount: target,
      target_date: targetDate.toISOString().slice(0, 10),
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
