"use client";

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, Target } from '@phosphor-icons/react';

type Profile = Record<string, string | number | null> & {
  interview_completed_at?: string | null;
  interview_current_step?: number | null;
};

type Question = {
  key: string;
  section: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  hint?: string;
};

const listFields = ['income_sources', 'short_term_goals', 'medium_term_goals', 'long_term_goals', 'goal_priorities', 'financial_concerns', 'valued_pleasures', 'pleasures_to_reduce', 'recurring_life_costs', 'work_essential_costs', 'recurring_investments'] as const;
const empty: Profile = { full_name: '', monthly_income_target: '', birth_year: '', occupation: '', industry: '', work_model: '', income_sources: '', income_growth_goal: '', short_term_goals: '', medium_term_goals: '', long_term_goals: '', goal_priorities: '', monthly_goal_capacity: '', financial_concerns: '', valued_pleasures: '', pleasures_to_reduce: '', recurring_life_costs: '', work_essential_costs: '', recurring_investments: '', emergency_fund_status: '', investment_experience: '', risk_tolerance: '', recommendation_style: '', interview_current_step: 0 };
const questions: Question[] = [
  { key: 'goal_priorities', section: 'Tu brújula', label: '¿Qué es lo más importante en tu vida, en orden?', placeholder: 'Ej. Fe, familia, salud, libertad y trabajo', multiline: true, hint: 'Esto orientará el plan, pero no se convertirá en una meta con precio.' },
  { key: 'monthly_income_target', section: 'Tu realidad', label: '¿Qué ingreso mensual quieres alcanzar?', placeholder: 'Ej. 60,000' },
  { key: 'short_term_goals', section: 'Resultados concretos', label: '¿Qué resultado financiero quieres lograr primero?', placeholder: 'Ej. Liquidar mi tarjeta o ahorrar para independizarme', multiline: true, hint: 'Máximo dos metas para los próximos 12 meses, separadas por coma.' },
  { key: 'medium_term_goals', section: 'Resultados concretos', label: '¿Qué quieres financiar después?', placeholder: 'Ej. Viajar, abrir una sucursal o dar el enganche de una casa', multiline: true, hint: 'Máximo dos metas de 1 a 5 años, separadas por coma.' },
  { key: 'monthly_goal_capacity', section: 'Capacidad', label: '¿Cuánto puedes separar al mes sin descuidar lo esencial?', placeholder: 'Ej. 8,000' },
];

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
  return /supabase|api|schema|migration|token|secret|key|endpoint|webhook|oauth|env\b|json|unexpected end|parse/i.test(message)
    ? 'No pude guardar tus respuestas. Intenta nuevamente.'
    : message || 'No pude guardar tus respuestas.';
};

export default function PersonalizationInterview({
  enabled,
  request,
  initialOpen = false,
  guided = false,
  onCompleted,
  onDeferred,
}: {
  enabled: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  initialOpen?: boolean;
  guided?: boolean;
  onCompleted?: () => void | Promise<void>;
  onDeferred?: () => void | Promise<void>;
}) {
  const [profile, setProfile] = useState<Profile>(empty);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [open, setOpen] = useState(initialOpen || guided);
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
        if (cancelled || !data?.personalization) return;
        const normalized = normalizeProfile(data.personalization);
        const savedStep = Number(normalized.interview_current_step || 0);
        setProfile(normalized);
        setQuestionIndex(Math.min(Math.max(savedStep, 0), questions.length - 1));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => { cancelled = true; };
  }, [enabled, request]);

  const completion = useMemo(() => Math.round((questions.filter((question) => list(profile[question.key]).trim()).length / questions.length) * 100), [profile]);
  const currentQuestion = questions[questionIndex];
  const isLastQuestion = questionIndex === questions.length - 1;
  const set = (key: string, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  async function save({ completed = false, deferred = false, nextStep = questionIndex }: { completed?: boolean; deferred?: boolean; nextStep?: number } = {}) {
    setSaving(true);
    setFeedback('');

    try {
      const response = await request('/api/account/personalization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, completed, deferred, currentStep: nextStep }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data?.success || !data.personalization) {
        throw new Error(data?.error || 'No pude guardar tus respuestas. Intenta nuevamente.');
      }

      setProfile(normalizeProfile(data.personalization));

      if (completed) {
        setFeedback('Tus metas quedaron listas. El agente VirafIA ya puede usarlas para personalizar tu experiencia.');
        setOpen(false);
        await onCompleted?.();
      } else if (deferred) {
        setFeedback('Progreso guardado. Podrás retomarlo desde tus metas.');
        await onDeferred?.();
      } else {
        setQuestionIndex(nextStep);
      }
    } catch (error) {
      setFeedback(safeFeedback(error));
    } finally {
      setSaving(false);
    }
  }

  function renderQuestion(question: Question) {
    const commonClassName = 'mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-normal text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
    if (question.multiline) {
      return <textarea autoFocus value={String(profile[question.key] || '')} onChange={(event) => set(question.key, event.target.value)} placeholder={question.placeholder} rows={5} className={`${commonClassName} min-h-36 resize-y leading-7`} />;
    }
    return <input autoFocus value={String(profile[question.key] || '')} onChange={(event) => set(question.key, event.target.value)} placeholder={question.placeholder} className={`${commonClassName} h-13`} />;
  }

  return (
    <section className={`overflow-hidden rounded-xl border bg-white shadow-sm ${guided ? 'border-slate-200' : 'border-blue-200'}`}>
      {!guided && (
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Personaliza tu experiencia financiera</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Cinco preguntas para traducir lo que valoras en resultados financieros concretos. Puedes continuar después.</p>
          </div>
          <button type="button" disabled={!enabled || profileLoading} onClick={() => setOpen((value) => !value)} className="shrink-0 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {profileLoading ? 'Cargando metas...' : open ? 'Cerrar' : profile.interview_completed_at ? 'Editar respuestas' : Number(profile.interview_current_step || 0) > 0 ? 'Continuar' : 'Definir metas'}
          </button>
        </div>
      )}

      {!guided && (
        <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
          <div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${completion}%` }} /></div>
          <span className="text-xs font-bold text-slate-500">{completion}%</span>
        </div>
      )}

      {feedback && <p className="mx-5 mt-5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{feedback}</p>}
      {open && profileLoading && <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">Cargando tus respuestas...</p>}

      {open && !profileLoading && (
        <div className="p-5 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Target aria-hidden="true" className="size-5" weight="duotone" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">{currentQuestion.section}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-400">Pregunta {questionIndex + 1} de {questions.length}</p>
              </div>
            </div>
            <span className="text-sm font-bold text-slate-500">{Math.round(((questionIndex + 1) / questions.length) * 100)}%</span>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`Pregunta ${questionIndex + 1} de ${questions.length}`}>
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} />
          </div>

          <label className="mt-8 block">
            <span className="block max-w-2xl text-2xl font-bold leading-tight text-slate-950 md:text-3xl">{currentQuestion.label}</span>
            {renderQuestion(currentQuestion)}
            {currentQuestion.hint && <span className="mt-2 block text-xs leading-5 text-slate-400">{currentQuestion.hint}</span>}
          </label>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void save({ deferred: true, nextStep: questionIndex })} disabled={saving} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">
              Guardar para después
            </button>
            <div className="flex gap-2">
              {questionIndex > 0 && <button type="button" onClick={() => setQuestionIndex((value) => value - 1)} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ArrowLeft aria-hidden="true" className="size-4" /> Anterior</button>}
              <button type="button" onClick={() => void save({ completed: isLastQuestion, nextStep: isLastQuestion ? questionIndex : questionIndex + 1 })} disabled={saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:flex-none">
                {saving ? 'Guardando...' : isLastQuestion ? <><CheckCircle aria-hidden="true" className="size-5" weight="fill" /> Finalizar</> : <>Guardar y continuar <ArrowRight aria-hidden="true" className="size-4" /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
