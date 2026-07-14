"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Profile = Record<string, string | number | null> & { interview_completed_at?: string | null };
const listFields = ['income_sources', 'short_term_goals', 'medium_term_goals', 'long_term_goals', 'goal_priorities', 'financial_concerns', 'valued_pleasures', 'pleasures_to_reduce', 'recurring_life_costs', 'work_essential_costs', 'recurring_investments'] as const;
const empty: Profile = { full_name: '', monthly_income_target: '', birth_year: '', occupation: '', industry: '', work_model: '', income_sources: '', income_growth_goal: '', short_term_goals: '', medium_term_goals: '', long_term_goals: '', goal_priorities: '', monthly_goal_capacity: '', financial_concerns: '', valued_pleasures: '', pleasures_to_reduce: '', recurring_life_costs: '', work_essential_costs: '', recurring_investments: '', emergency_fund_status: '', investment_experience: '', risk_tolerance: '', recommendation_style: '' };
const steps = ['Tu realidad', 'Tus metas', 'Tu estilo de vida', 'Inversión y recomendaciones'];
const list = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value || '');
const normalizeProfile = (value: Record<string, unknown>): Profile => {
  const normalized = { ...empty, ...value } as Record<string, unknown>;
  for (const field of listFields) normalized[field] = list(value[field]);
  return normalized as Profile;
};
async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as { success?: boolean; error?: string; personalization?: Record<string, unknown> | null };
  } catch {
    return null;
  }
}
const safeFeedback = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value || '');
  return /supabase|api|schema|migration|token|secret|key|endpoint|webhook|oauth|env\b|json|unexpected end|parse/i.test(message) ? 'No pude guardar tus respuestas. Intenta nuevamente.' : message || 'No pude guardar tus respuestas.';
};
const Input = ({ label, value, onChange, placeholder = '' }: { label: string; value: unknown; onChange: (value: string) => void; placeholder?: string }) => <label className="grid gap-2 text-sm font-semibold text-slate-700">{label}<input value={String(value || '')} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 rounded-lg border border-slate-200 px-3 font-normal outline-none focus:border-blue-500" /></label>;
const TextList = ({ label, value, onChange, hint }: { label: string; value: unknown; onChange: (value: string) => void; hint: string }) => <label className="grid gap-2 text-sm font-semibold text-slate-700">{label}<textarea value={String(value || '')} onChange={(event) => onChange(event.target.value)} placeholder={hint} rows={3} className="rounded-lg border border-slate-200 px-3 py-2 font-normal leading-6 outline-none focus:border-blue-500" /><span className="text-xs font-normal text-slate-400">Escribe normalmente. Usa una coma únicamente para separar respuestas distintas.</span></label>;

export default function PersonalizationInterview({ enabled, request, initialOpen = false, onCompleted }: { enabled: boolean; request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; initialOpen?: boolean; onCompleted?: () => void | Promise<void> }) {
  const [profile, setProfile] = useState<Profile>(empty);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(initialOpen);
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(enabled);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!enabled) return;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setProfileLoading(true);
        return request('/api/account/personalization', { cache: 'no-store' });
      })
      .then(readJsonResponse)
      .then((data) => {
        if (!cancelled && data?.personalization) setProfile(normalizeProfile(data.personalization));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled, request]);
  const completion = useMemo(() => Math.round((['occupation', 'industry', 'income_sources', 'short_term_goals', 'valued_pleasures', 'recurring_life_costs', 'risk_tolerance'].filter((key) => list(profile[key]).trim()).length / 7) * 100), [profile]);
  const set = (key: string, value: string) => setProfile((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent, completed = false) { event.preventDefault(); setSaving(true); setFeedback(''); try { const response = await request('/api/account/personalization', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...profile, completed }) }); const data = await readJsonResponse(response); if (!response.ok || !data?.success || !data.personalization) throw new Error(data?.error || 'No pude guardar tus respuestas. Intenta nuevamente.'); setProfile(normalizeProfile(data.personalization)); setFeedback(completed ? 'Perfil personalizado listo. La IA ya puede usar este contexto.' : 'Progreso guardado. Puedes continuar después.'); if (completed) { setOpen(false); await onCompleted?.(); } } catch (error) { setFeedback(safeFeedback(error)); } finally { setSaving(false); } }
  return <section className="rounded-lg border border-blue-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-bold text-slate-950">Personaliza tu experiencia financiera</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Cuéntanos quién eres, qué quieres lograr y qué valoras. Esto permite recomendarte cómo aumentar ingresos en tu ramo, reducir gastos sin sacrificar lo importante y construir una estrategia de inversión coherente contigo.</p></div><button type="button" disabled={!enabled || profileLoading} onClick={() => setOpen((value) => !value)} className="shrink-0 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{profileLoading ? 'Cargando perfil...' : open ? 'Cerrar entrevista' : profile.interview_completed_at ? 'Editar respuestas' : 'Comenzar entrevista'}</button></div>
    <div className="mt-4 flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${completion}%` }} /></div><span className="text-xs font-bold text-slate-500">{completion}%</span></div>
    {feedback && <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{feedback}</p>}
    {open && profileLoading && <p className="mt-6 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Cargando tus respuestas...</p>}
    {open && !profileLoading && <form onSubmit={(event) => void save(event, step === steps.length - 1)} className="mt-6 border-t border-slate-100 pt-6"><div className="mb-5 flex flex-wrap gap-2">{steps.map((label, index) => <button key={label} type="button" onClick={() => setStep(index)} className={`rounded-lg px-3 py-2 text-xs font-bold ${index === step ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}. {label}</button>)}</div>
      <div className="grid gap-4 md:grid-cols-2">
        {step === 0 && <><Input label="¿Cómo te llamas?" value={profile.full_name} onChange={(v) => set('full_name', v)} placeholder="Tu nombre" /><Input label="¿Qué ingreso mensual quieres alcanzar?" value={profile.monthly_income_target} onChange={(v) => set('monthly_income_target', v)} placeholder="Ej. 60000" /><Input label="¿En qué año naciste?" value={profile.birth_year} onChange={(v) => set('birth_year', v)} placeholder="Ej. 1990" /><Input label="¿A qué te dedicas?" value={profile.occupation} onChange={(v) => set('occupation', v)} placeholder="Ej. diseñador independiente" /><Input label="¿En qué industria o ramo trabajas?" value={profile.industry} onChange={(v) => set('industry', v)} placeholder="Ej. construcción, tecnología, salud" /><Input label="¿Cómo trabajas?" value={profile.work_model} onChange={(v) => set('work_model', v)} placeholder="Empleado, negocio propio, freelance..." /><TextList label="¿De dónde viene tu dinero?" value={profile.income_sources} onChange={(v) => set('income_sources', v)} hint="Sueldo, clientes, rentas, ventas..." /><Input label="¿Cómo te gustaría aumentar tus ingresos?" value={profile.income_growth_goal} onChange={(v) => set('income_growth_goal', v)} placeholder="Cuéntanos qué oportunidad buscas" /></>}
        {step === 1 && <><TextList label="Metas en los próximos 12 meses" value={profile.short_term_goals} onChange={(v) => set('short_term_goals', v)} hint="Ej. abrir una segunda sucursal, pagar una deuda, viajar..." /><TextList label="Metas de 1 a 5 años" value={profile.medium_term_goals} onChange={(v) => set('medium_term_goals', v)} hint="Ej. comprar equipo, una casa, crecer el negocio..." /><TextList label="Metas de largo plazo" value={profile.long_term_goals} onChange={(v) => set('long_term_goals', v)} hint="Ej. independencia financiera, cambiar de profesión..." /><TextList label="¿Cuáles son tus prioridades, en orden?" value={profile.goal_priorities} onChange={(v) => set('goal_priorities', v)} hint="Escribe primero la más importante" /><Input label="¿Cuánto puedes destinar al mes a tus metas?" value={profile.monthly_goal_capacity} onChange={(v) => set('monthly_goal_capacity', v)} placeholder="Ej. 8000" /><TextList label="¿Qué te preocupa hoy?" value={profile.financial_concerns} onChange={(v) => set('financial_concerns', v)} hint="Ingresos variables, deudas, estabilidad..." /></>}
        {step === 2 && <><div className="md:col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Solo necesitamos cuatro criterios.</strong> Con estas respuestas, el agente clasificará automáticamente cada movimiento bancario como Vida, Placeres o Futuro para tu cuenta.</div><TextList label="1. ¿Qué pagos son indispensables para tu vida?" value={profile.recurring_life_costs} onChange={(v) => set('recurring_life_costs', v)} hint="Ej. renta, despensa, escuela, transporte, salud" /><TextList label="2. ¿Qué pagos necesitas para trabajar o generar ingresos?" value={profile.work_essential_costs} onChange={(v) => set('work_essential_costs', v)} hint="Ej. software, gasolina de trabajo, proveedores, herramientas" /><TextList label="3. ¿Qué gustos o placeres quieres conservar?" value={profile.valued_pleasures} onChange={(v) => set('valued_pleasures', v)} hint="Ej. viajes, restaurantes, hobbies, cafés" /><TextList label="4. ¿Qué aportaciones construyen tu futuro?" value={profile.recurring_investments} onChange={(v) => set('recurring_investments', v)} hint="Ej. CETES, ahorro para casa, seguro, fondo de emergencia" /></>}
        {step === 3 && <><Input label="¿Cómo está tu fondo de emergencia?" value={profile.emergency_fund_status} onChange={(v) => set('emergency_fund_status', v)} placeholder="No tengo / 1 mes / 3 meses..." /><Input label="Experiencia invirtiendo" value={profile.investment_experience} onChange={(v) => set('investment_experience', v)} placeholder="Ninguna, básica, intermedia..." /><Input label="Tolerancia al riesgo" value={profile.risk_tolerance} onChange={(v) => set('risk_tolerance', v)} placeholder="Conservadora, moderada, alta..." /><Input label="¿Cómo quieres recibir recomendaciones?" value={profile.recommendation_style} onChange={(v) => set('recommendation_style', v)} placeholder="Directas, educativas, paso a paso..." /></>}
      </div><div className="mt-6 flex flex-wrap justify-between gap-3"><button type="button" onClick={(event) => void save(event as unknown as FormEvent, false)} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Guardar y seguir después</button><div className="flex gap-2">{step > 0 && <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold">Anterior</button>}<button type="submit" disabled={saving} onClick={step < steps.length - 1 ? (event) => { event.preventDefault(); setStep((value) => value + 1); } : undefined} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">{saving ? 'Guardando...' : step < steps.length - 1 ? 'Siguiente' : 'Guardar perfil completo'}</button></div></div>
    </form>}
  </section>;
}
