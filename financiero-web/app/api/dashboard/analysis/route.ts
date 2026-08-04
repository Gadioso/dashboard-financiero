import { NextResponse } from 'next/server';
import { extraerJson, generateGeminiText } from '@/lib/gemini';
import { getRequestTenantContext } from '@/lib/tenant-context';
import { getSupabaseServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

type AnalysisBody = {
  locale?: 'es-MX' | 'en-US';
  scope?: 'month' | 'year';
  periodKey?: string;
  monthLabel?: string;
  summary?: unknown;
  monthly?: unknown;
  monthlySeries?: unknown;
  buckets?: unknown;
  goal?: unknown;
};

type DashboardAnalysis = {
  headline: string;
  diagnosis: string;
  actions: string[];
  risks: string[];
};

function mexicoDayStartIso() {
  const now = new Date();
  const mexicoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return new Date(`${mexicoDate}T00:00:00-06:00`).toISOString();
}

async function saveAnalysis(profileId: string, scope: 'month' | 'year', periodKey: string, analysis: DashboardAnalysis, generatedBy: string) {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return;
  await supabase.from('agent_findings').insert({
    profile_id: profileId,
    agent_key: `dashboard_analysis_${scope}`,
    finding_type: periodKey,
    severity: 'info',
    title: analysis.headline,
    summary: analysis.diagnosis,
    recommendation: analysis.actions.join('\n'),
    confidence: generatedBy === 'analysis-engine' ? 0.75 : 0.9,
    status: 'active',
    evidence: { risks: analysis.risks },
    metadata: { analysis, generatedBy, scope, periodKey },
  });
}

const providerCooldownMs = 5 * 60 * 1000;
const providerUnavailableUntil = new Map<string, number>();

function getGoogleApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function providerInCooldown(provider: string) {
  const unavailableUntil = providerUnavailableUntil.get(provider) || 0;

  if (unavailableUntil <= Date.now()) {
    providerUnavailableUntil.delete(provider);
    return false;
  }

  return true;
}

function markProviderCooldown(provider: string) {
  providerUnavailableUntil.set(provider, Date.now() + providerCooldownMs);
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function displayBucketLabel(label: string) {
  if (label === 'Vida') return 'Living';
  if (label === 'Placeres') return 'Wants';
  if (label === 'Futuro' || label === 'Emer/Inv') return 'Emergency / investments';
  return label;
}

function getSummary(body: AnalysisBody) {
  const summary = asRecord(body.summary);

  return {
    ingresosMes: toNumber(summary.ingresosMes),
    totalGastadoMes: toNumber(summary.totalGastadoMes),
    flujoNetoMes: toNumber(summary.flujoNetoMes),
    tasaFuturo: toNumber(summary.tasaFuturo),
    burnRate: toNumber(summary.burnRate),
  };
}

function getBuckets(body: AnalysisBody) {
  if (!Array.isArray(body.buckets)) return [];

  return body.buckets
    .map((bucket) => {
      const data = asRecord(bucket);

      return {
        label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : 'Bolsa',
        limit: toNumber(data.limit),
        percent: toNumber(data.percent),
        remaining: toNumber(data.remaining),
        used: toNumber(data.used),
      };
    })
    .filter((bucket) => bucket.used || bucket.limit || bucket.percent);
}

function getGoal(body: AnalysisBody) {
  const goal = asRecord(body.goal);

  return {
    monthlyIncomeTarget: toNumber(goal.monthlyIncomeTarget),
    currentMonthlyIncome: toNumber(goal.currentMonthlyIncome),
    averageIncomeLast3Months: toNumber(goal.averageIncomeLast3Months),
    monthlyGap: toNumber(goal.monthlyGap),
    gapVsThreeMonthAverage: toNumber(goal.gapVsThreeMonthAverage),
    targetPerBucket: toNumber(goal.targetPerBucket),
    progressPct: toNumber(goal.progressPct),
  };
}

function getMonthlySeries(body: AnalysisBody) {
  if (!Array.isArray(body.monthlySeries)) return [];

  return body.monthlySeries.map((value) => {
    const month = asRecord(value);
    return {
      mes: String(month.mes || 'Mes'),
      ingresos: toNumber(month.ingresos),
      egresos: toNumber(month.egresos),
      resultado: toNumber(month.resultado),
    };
  });
}

function ruleBasedYearAnalysis(monthLabel: string, body: AnalysisBody): DashboardAnalysis {
  const summary = getSummary(body);
  const months = getMonthlySeries(body).filter((month) => month.ingresos || month.egresos || month.resultado);
  const buckets = getBuckets(body);
  const averageIncome = months.length ? summary.ingresosMes / months.length : 0;
  const averageExpense = months.length ? summary.totalGastadoMes / months.length : 0;
  const projectedIncome = averageIncome * 12;
  const projectedFlow = months.length ? (summary.flujoNetoMes / months.length) * 12 : 0;
  const bestMonth = [...months].sort((a, b) => b.resultado - a.resultado)[0];
  const worstMonth = [...months].sort((a, b) => a.resultado - b.resultado)[0];
  const positiveMonths = months.filter((month) => month.resultado >= 0).length;
  const futureBucket = buckets.find((bucket) => bucket.label === 'Emer/Inv' || bucket.label === 'Futuro');

  return {
    headline: months.length
      ? summary.flujoNetoMes < 0
        ? 'La trayectoria anual necesita recuperar flujo'
        : `${positiveMonths} de ${months.length} meses sostienen flujo positivo`
      : `Lectura anual de ${monthLabel} pendiente de datos`,
    diagnosis: months.length
      ? `De enero a la fecha, los ingresos suman ${formatMoney(summary.ingresosMes)}, los egresos ${formatMoney(summary.totalGastadoMes)} y el flujo neto ${formatMoney(summary.flujoNetoMes)}. El promedio mensual es ${formatMoney(averageIncome)} de ingreso y ${formatMoney(averageExpense)} de gasto.${bestMonth ? ` ${bestMonth.mes} fue el mejor mes (${formatMoney(bestMonth.resultado)}).` : ''}${worstMonth ? ` ${worstMonth.mes} fue el más débil (${formatMoney(worstMonth.resultado)}).` : ''} Al ritmo actual, el cierre proyectado es ${formatMoney(projectedIncome)} de ingresos y ${formatMoney(projectedFlow)} de flujo. La proyección es una estimación basada en los meses transcurridos.`
      : 'No hay suficientes meses con movimientos para comparar trayectoria, consistencia o proyección de cierre.',
    actions: [
      `Revisar al cierre de cada mes si el ingreso supera el promedio anual de ${formatMoney(averageIncome)}.`,
      worstMonth ? `Identificar y corregir el patrón que produjo ${formatMoney(worstMonth.resultado)} de flujo en ${worstMonth.mes}.` : 'Completar la información mensual antes de proyectar el cierre.',
      `Proteger una trayectoria de flujo anual cercana a ${formatMoney(projectedFlow)} y actualizar la proyección cada mes.`,
    ],
    risks: [
      positiveMonths < Math.ceil(months.length / 2) ? 'La mayoría de los meses no mantiene flujo positivo.' : '',
      futureBucket && futureBucket.percent < 75 ? `Emer/Inv acumula sólo ${formatPercent(futureBucket.percent)} de su ritmo anual esperado.` : '',
    ].filter(Boolean).length
      ? [
          positiveMonths < Math.ceil(months.length / 2) ? 'La mayoría de los meses no mantiene flujo positivo.' : '',
          futureBucket && futureBucket.percent < 75 ? `Emer/Inv acumula sólo ${formatPercent(futureBucket.percent)} de su ritmo anual esperado.` : '',
        ].filter(Boolean)
      : ['La proyección puede variar si los próximos meses se apartan del promedio observado.'],
  };
}

function ruleBasedEnglishAnalysis(scope: 'month' | 'year', monthLabel: string, body: AnalysisBody): DashboardAnalysis {
  const summary = getSummary(body);
  const months = getMonthlySeries(body).filter((month) => month.ingresos || month.egresos || month.resultado);
  const buckets = getBuckets(body);

  if (scope === 'year') {
    const averageIncome = months.length ? summary.ingresosMes / months.length : 0;
    const averageExpense = months.length ? summary.totalGastadoMes / months.length : 0;
    const projectedIncome = averageIncome * 12;
    const projectedFlow = months.length ? (summary.flujoNetoMes / months.length) * 12 : 0;
    const bestMonth = [...months].sort((a, b) => b.resultado - a.resultado)[0];
    const worstMonth = [...months].sort((a, b) => a.resultado - b.resultado)[0];
    const positiveMonths = months.filter((month) => month.resultado >= 0).length;
    const futureBucket = buckets.find((bucket) => bucket.label === 'Emer/Inv' || bucket.label === 'Futuro');

    return {
      headline: months.length
        ? summary.flujoNetoMes < 0
          ? 'The annual trajectory needs to recover cash flow'
          : `${positiveMonths} of ${months.length} months maintain positive cash flow`
        : `The annual review through ${monthLabel} is waiting for data`,
      diagnosis: months.length
        ? `Year to date, income totals ${formatMoney(summary.ingresosMes)}, expenses total ${formatMoney(summary.totalGastadoMes)}, and net cash flow is ${formatMoney(summary.flujoNetoMes)}. Monthly averages are ${formatMoney(averageIncome)} of income and ${formatMoney(averageExpense)} of expenses.${bestMonth ? ` ${bestMonth.mes} was the strongest month (${formatMoney(bestMonth.resultado)}).` : ''}${worstMonth ? ` ${worstMonth.mes} was the weakest (${formatMoney(worstMonth.resultado)}).` : ''} At the current pace, projected year-end income is ${formatMoney(projectedIncome)} and projected cash flow is ${formatMoney(projectedFlow)}. This projection is an estimate based on elapsed months.`
        : 'There are not enough months with transactions to compare trajectory, consistency, or a year-end projection.',
      actions: [
        `At each month-end, check whether income exceeds the annual monthly average of ${formatMoney(averageIncome)}.`,
        worstMonth ? `Identify and correct the pattern that produced ${formatMoney(worstMonth.resultado)} of cash flow in ${worstMonth.mes}.` : 'Complete monthly information before projecting year-end results.',
        `Protect an annual cash-flow trajectory near ${formatMoney(projectedFlow)} and update the projection every month.`,
      ],
      risks: [
        positiveMonths < Math.ceil(months.length / 2) ? 'Most months are not maintaining positive cash flow.' : '',
        futureBucket && futureBucket.percent < 75 ? `Emergency / investments has accumulated only ${formatPercent(futureBucket.percent)} of its expected annual pace.` : '',
      ].filter(Boolean).length
        ? [
            positiveMonths < Math.ceil(months.length / 2) ? 'Most months are not maintaining positive cash flow.' : '',
            futureBucket && futureBucket.percent < 75 ? `Emergency / investments has accumulated only ${formatPercent(futureBucket.percent)} of its expected annual pace.` : '',
          ].filter(Boolean)
        : ['The projection may vary if upcoming months differ from the observed average.'],
    };
  }

  const goal = getGoal(body);
  const pressuredBucket = [...buckets].sort((a, b) => b.percent - a.percent)[0];
  const pressuredLabel = pressuredBucket ? displayBucketLabel(pressuredBucket.label) : '';
  const hasMoneyData = summary.ingresosMes || summary.totalGastadoMes || summary.flujoNetoMes;
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  let headline = `${monthTitle} remains orderly`;
  if (!hasMoneyData) headline = `${monthTitle} review is ready`;
  else if (summary.flujoNetoMes < 0) headline = `${monthTitle} needs to recover cash flow`;
  else if (summary.burnRate >= 90 || (pressuredBucket && pressuredBucket.percent >= 90)) headline = `${monthTitle} is putting pressure on the budget`;
  else if (summary.flujoNetoMes > 0) headline = `${monthTitle} maintains a positive margin`;

  const diagnosisParts: string[] = [];
  if (hasMoneyData) diagnosisParts.push(`Recorded income: ${formatMoney(summary.ingresosMes)}; expenses: ${formatMoney(summary.totalGastadoMes)}; net cash flow: ${formatMoney(summary.flujoNetoMes)}.`);
  else diagnosisParts.push('There are still few transactions recorded for this period; keep records current so decisions use complete data.');
  if (pressuredBucket) diagnosisParts.push(`${pressuredLabel} has the most pressure: ${formatPercent(pressuredBucket.percent)} used with ${formatMoney(pressuredBucket.remaining)} remaining.`);
  if (summary.tasaFuturo > 0) diagnosisParts.push(`Emergency / investments is at ${formatPercent(summary.tasaFuturo)}, versus an operating target of 25% (10% emergency and 15% goal-directed investing).`);
  if (goal.monthlyIncomeTarget > 0) {
    diagnosisParts.unshift(`The monthly target is ${formatMoney(goal.monthlyIncomeTarget)} and current progress is ${formatPercent(goal.progressPct)}; ${formatMoney(goal.monthlyGap)} remains this month.`);
    diagnosisParts.push(`Against the actual three-month average (${formatMoney(goal.averageIncomeLast3Months)}), the structural gap is ${formatMoney(goal.gapVsThreeMonthAverage)}.`);
  }

  const actions: string[] = [];
  if (goal.monthlyIncomeTarget > 0 && goal.gapVsThreeMonthAverage > 0) actions.push(`Create ${formatMoney(goal.gapVsThreeMonthAverage)} of additional recurring monthly income; review progress and pipeline weekly until the gap versus the three-month average closes.`);
  if (summary.flujoNetoMes < 0) actions.push(`Cut or defer ${formatMoney(Math.abs(summary.flujoNetoMes))} of variable expenses to restore positive cash flow.`);
  else if (hasMoneyData) actions.push(`Protect the positive margin of ${formatMoney(summary.flujoNetoMes)} before authorizing new expenses.`);
  else actions.push('Record income, expenses, and pending payments for the period before moving the budget.');
  if (pressuredBucket && pressuredBucket.percent >= 80) actions.push(`Freeze new charges in ${pressuredLabel} until at least ${formatMoney(Math.max(0, pressuredBucket.limit * 0.15))} of room is restored.`);
  else if (pressuredBucket) actions.push(`Review ${pressuredLabel} twice a week to prevent it from moving from ${formatPercent(pressuredBucket.percent)} into the critical zone.`);
  if (summary.tasaFuturo < 25) actions.push(`Set aside up to ${formatMoney(goal.targetPerBucket || summary.ingresosMes * 0.25)} for Emergency / investments as income arrives; the current pace is ${formatPercent(Math.max(0, 25 - summary.tasaFuturo))} points short. Within that amount, use 10% for emergencies and 15% for the investment goal.`);
  else actions.push('Keep Emergency / investments separate from ordinary payments and direct the 15% investment portion to the priority goal.');
  actions.push('Close the period by reviewing income, expenses, net cash flow, and allocations outside their ranges.');

  const risks: string[] = [];
  if (summary.flujoNetoMes < 0) risks.push(`Negative cash flow of ${formatMoney(summary.flujoNetoMes)} may require reserves or credit.`);
  if (pressuredBucket && pressuredBucket.percent >= 100) risks.push(`${pressuredLabel} has exceeded its limit and needs an immediate adjustment.`);
  else if (pressuredBucket && pressuredBucket.percent >= 90) risks.push(`${pressuredLabel} is close to saturation at ${formatPercent(pressuredBucket.percent)} used.`);
  if (summary.tasaFuturo < 25) risks.push('Emergency / investments is below the required pace and may weaken saving goals.');
  if (!risks.length) risks.push('The main risk is relaxing daily record-keeping and losing visibility into actual cash flow.');

  return { headline, diagnosis: diagnosisParts.join(' '), actions: actions.slice(0, 5), risks: risks.slice(0, 4) };
}

function ruleBasedAnalysis(scope: 'month' | 'year', monthLabel: string, body: AnalysisBody) {
  if (body.locale === 'en-US') return ruleBasedEnglishAnalysis(scope, monthLabel, body);
  if (scope === 'year') return ruleBasedYearAnalysis(monthLabel, body);
  const summary = getSummary(body);
  const buckets = getBuckets(body);
  const goal = getGoal(body);
  const pressuredBucket = [...buckets].sort((a, b) => b.percent - a.percent)[0];
  const hasMoneyData = summary.ingresosMes || summary.totalGastadoMes || summary.flujoNetoMes;
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const scopeLabel = monthTitle;
  const normalizedScopeLabel = monthLabel.toLowerCase();

  let headline = `${scopeLabel} mantiene una lectura ordenada`;
  if (!hasMoneyData) headline = `Lectura de ${normalizedScopeLabel} lista`;
  else if (summary.flujoNetoMes < 0) headline = `${scopeLabel} necesita recuperar flujo`;
  else if (summary.burnRate >= 90 || (pressuredBucket && pressuredBucket.percent >= 90)) headline = `${scopeLabel} está presionando el presupuesto`;
  else if (summary.flujoNetoMes > 0) headline = `${scopeLabel} mantiene margen positivo`;

  const diagnosisParts: string[] = [];
  if (hasMoneyData) {
    diagnosisParts.push(`Ingresos registrados: ${formatMoney(summary.ingresosMes)}; egresos: ${formatMoney(summary.totalGastadoMes)}; flujo neto: ${formatMoney(summary.flujoNetoMes)}.`);
  } else {
    diagnosisParts.push('Aún hay pocos movimientos registrados para este periodo; la prioridad es mantener la captura al día para que las decisiones salgan de datos completos.');
  }
  if (pressuredBucket) {
    diagnosisParts.push(`${pressuredBucket.label} es la bolsa con mayor presión: lleva ${formatPercent(pressuredBucket.percent)} usado y le quedan ${formatMoney(pressuredBucket.remaining)}.`);
  }
  if (summary.tasaFuturo > 0) {
    diagnosisParts.push(`La asignación a Emer/Inv va en ${formatPercent(summary.tasaFuturo)}, contra una meta operativa de 25% (10% emergencia y 15% inversión para metas).`);
  }
  if (goal.monthlyIncomeTarget > 0) {
    diagnosisParts.unshift(`La meta mensual es ${formatMoney(goal.monthlyIncomeTarget)} y el avance actual es ${formatPercent(goal.progressPct)}; faltan ${formatMoney(goal.monthlyGap)} este mes.`);
    diagnosisParts.push(`Contra el promedio real de 3 meses (${formatMoney(goal.averageIncomeLast3Months)}), la brecha estructural es ${formatMoney(goal.gapVsThreeMonthAverage)}.`);
  }

  const actions: string[] = [];
  if (goal.monthlyIncomeTarget > 0 && goal.gapVsThreeMonthAverage > 0) {
    actions.push(`Crear ingreso recurrente adicional por ${formatMoney(goal.gapVsThreeMonthAverage)} al mes; revisar semanalmente avance y pipeline hasta cubrir la brecha contra el promedio de 3 meses.`);
  }
  if (summary.flujoNetoMes < 0) {
    actions.push(`Recortar o diferir ${formatMoney(Math.abs(summary.flujoNetoMes))} en gastos variables para volver a flujo positivo.`);
  } else if (hasMoneyData) {
    actions.push(`Proteger el margen positivo de ${formatMoney(summary.flujoNetoMes)} antes de autorizar gastos nuevos.`);
  } else {
    actions.push('Registrar ingresos, gastos y pagos pendientes del periodo antes de mover presupuesto.');
  }
  if (pressuredBucket && pressuredBucket.percent >= 80) {
    actions.push(`Congelar cargos nuevos en ${pressuredBucket.label} hasta liberar al menos ${formatMoney(Math.max(0, pressuredBucket.limit * 0.15))} de margen.`);
  } else if (pressuredBucket) {
    actions.push(`Revisar ${pressuredBucket.label} dos veces por semana para evitar que pase de ${formatPercent(pressuredBucket.percent)} a zona crítica.`);
  }
  if (summary.tasaFuturo < 25) {
    actions.push(`Separar hasta ${formatMoney(goal.targetPerBucket || summary.ingresosMes * 0.25)} para Emer/Inv conforme entre ingreso; hoy faltan ${formatPercent(Math.max(0, 25 - summary.tasaFuturo))} puntos para el ritmo objetivo. Dentro de ese monto: 10% a emergencia y 15% a la meta de inversión.`);
  } else {
    actions.push('Mantener Emer/Inv separado de pagos ordinarios y dirigir el 15% de inversión a la meta prioritaria.');
  }
  actions.push('Cerrar el periodo con una revisión de ingresos, egresos, flujo neto y bolsas fuera de rango.');

  const risks: string[] = [];
  if (summary.flujoNetoMes < 0) {
    risks.push(`Flujo neto negativo de ${formatMoney(summary.flujoNetoMes)} puede obligar a usar reservas o crédito.`);
  }
  if (pressuredBucket && pressuredBucket.percent >= 100) {
    risks.push(`${pressuredBucket.label} ya superó su límite y necesita ajuste inmediato.`);
  } else if (pressuredBucket && pressuredBucket.percent >= 90) {
    risks.push(`${pressuredBucket.label} está cerca de saturarse con ${formatPercent(pressuredBucket.percent)} usado.`);
  }
  if (summary.tasaFuturo < 25) {
    risks.push('Emer/Inv está por debajo del ritmo necesario y puede debilitar objetivos de ahorro.');
  }
  if (!risks.length) {
    risks.push('El principal riesgo es relajar la captura diaria y perder visibilidad del flujo real.');
  }

  return {
    headline,
    diagnosis: diagnosisParts.join(' '),
    actions: actions.slice(0, 5),
    risks: risks.slice(0, 4),
  };
}

function normalizeAnalysis(value: unknown, scope: 'month' | 'year', monthLabel: string, body: AnalysisBody) {
  const backup = ruleBasedAnalysis(scope, monthLabel, body);
  if (!value || typeof value !== 'object') return backup;

  const data = value as Record<string, unknown>;

  if (scope === 'year') {
    const modelDiagnosis = typeof data.diagnosis === 'string' ? data.diagnosis.trim() : '';
    const modelActions = Array.isArray(data.actions) ? data.actions.map(String) : [];
    const modelRisks = Array.isArray(data.risks) ? data.risks.map(String) : [];

    return {
      headline: backup.headline,
      diagnosis: [backup.diagnosis, modelDiagnosis].filter(Boolean).join(' '),
      actions: [...backup.actions, ...modelActions].filter((action, index, actions) => actions.indexOf(action) === index).slice(0, 5),
      risks: [...backup.risks, ...modelRisks].filter((risk, index, risks) => risks.indexOf(risk) === index).slice(0, 4),
    };
  }

  return {
    headline: typeof data.headline === 'string' && data.headline.trim() ? data.headline : backup.headline,
    diagnosis: typeof data.diagnosis === 'string' && data.diagnosis.trim() ? data.diagnosis : backup.diagnosis,
    actions: Array.isArray(data.actions) && data.actions.length ? data.actions.slice(0, 5).map(String) : backup.actions,
    risks: Array.isArray(data.risks) && data.risks.length ? data.risks.slice(0, 4).map(String) : backup.risks,
  };
}

export async function POST(request: Request) {
  const tenant = await getRequestTenantContext(request);

  if (!tenant.profileId) {
    return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AnalysisBody;
  const scope = body.scope === 'year' ? 'year' : 'month';
  const locale = body.locale === 'en-US' ? 'en-US' : 'es-MX';
  const monthLabel = body.monthLabel || 'MES';
  const periodKey = `${String(body.periodKey || monthLabel)}-${locale}`.slice(0, 40);
  const googleApiKey = getGoogleApiKey();
  const supabase = getSupabaseServiceClient();

  if (supabase) {
    const { data: cached } = await supabase
      .from('agent_findings')
      .select('metadata, created_at')
      .eq('profile_id', tenant.profileId)
      .eq('agent_key', `dashboard_analysis_${scope}`)
      .eq('finding_type', periodKey)
      .gte('created_at', mexicoDayStartIso())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const metadata = cached?.metadata as { analysis?: DashboardAnalysis; generatedBy?: string } | null;
    if (metadata?.analysis) {
      return NextResponse.json({ success: true, cached: true, generatedAt: cached?.created_at, generatedBy: metadata.generatedBy || 'cache', analysis: metadata.analysis });
    }
  }

  const prompt = `
Eres un analista financiero personal para el usuario autenticado. Analiza su dashboard con regla 50/25/25 y responde en ${locale === 'en-US' ? 'inglés de Estados Unidos' : 'español mexicano'}, de forma concreta y accionable. Vida es 50%, Placeres 25% y Emer/Inv 25%; dentro de Emer/Inv, 10% es emergencia y 15% se dirige a metas de inversión según horizonte y riesgo.

Alcance: ${scope === 'year' ? `acumulado 2026 de ${monthLabel}` : `mes ${monthLabel} 2026`}.

Datos:
${JSON.stringify({
  summary: body.summary,
  monthly: body.monthly,
  monthlySeries: body.monthlySeries,
  buckets: body.buckets,
  goal: body.goal,
}, null, 2)}

Reglas:
- No inventes datos.
- Si algo falta, dilo como limitación.
- Da lectura de comportamiento, no consejos genéricos.
- La meta mensual es el objetivo rector. Cuantifica la brecha contra el ingreso actual y contra el promedio de 3 meses.
- Explica cuánto debe provenir de mejorar ingresos, cuánto de controlar gasto y cuánto puede dirigirse a Emer/Inv/inversión; recortar gasto no cuenta como crear ingresos.
- Prioriza máximo 3 acciones, ordenadas por impacto, cada una con monto, frecuencia y criterio verificable de cumplimiento.
- Distingue inversión patrimonial de herramientas o gasto productivo; no presentes software como rendimiento de inversión.
- Si el alcance es mensual, analiza exclusivamente el mes seleccionado: movimientos, presupuesto consumido, flujo y acciones ejecutables antes del cierre de ese mes. No hagas proyecciones anuales salvo que sean indispensables.
- Si el alcance es anual, analiza desde enero hasta el último mes transcurrido. Compara meses, identifica tendencia, consistencia, mejor y peor mes, promedios mensuales, acumulado y proyección de cierre. No redactes el anual como si fuera un solo mes grande.
- En el anual, aclara que la proyección es una estimación basada en los meses transcurridos y no un resultado garantizado.
- Mantén máximo 5 acciones y 4 riesgos.
- Devuelve solo JSON válido sin markdown con esta forma:
{
  "headline": "título breve",
  "diagnosis": "diagnóstico de 2 a 4 frases",
  "actions": ["acción 1", "acción 2"],
  "risks": ["riesgo 1"]
}
`;

  if (!googleApiKey || providerInCooldown('gemini')) {
    const analysis = ruleBasedAnalysis(scope, monthLabel, body);
    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'analysis-engine');
    return NextResponse.json({
      success: true,
      generatedBy: 'analysis-engine',
      analysis,
    });
  }

  try {
    const raw = await generateGeminiText(googleApiKey, prompt);
    const analysis = normalizeAnalysis(JSON.parse(extraerJson(raw)), scope, monthLabel, body);

    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'gemini');

    return NextResponse.json({ success: true, generatedBy: 'gemini', analysis });
  } catch {
    markProviderCooldown('gemini');

    const analysis = ruleBasedAnalysis(scope, monthLabel, body);
    await saveAnalysis(tenant.profileId, scope, periodKey, analysis, 'analysis-engine');
    return NextResponse.json({
      success: true,
      generatedBy: 'analysis-engine',
      analysis,
    });
  }
}
