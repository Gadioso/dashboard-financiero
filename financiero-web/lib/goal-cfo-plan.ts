export type CfoGoalRow = {
  id: string;
  name: string;
  current_amount?: number | string | null;
  target_amount?: number | string | null;
  target_date?: string | null;
  horizon_months?: number | string | null;
  source?: string | null;
};

export type CfoPersonalization = {
  monthly_goal_capacity?: number | string | null;
  emergency_fund_status?: string | null;
  investment_experience?: string | null;
  risk_tolerance?: string | null;
  work_model?: string | null;
  goal_priorities?: string[] | null;
};

export type GoalCfoPlan = {
  monthlyCapacity: number;
  summary: string;
  allocations: Array<{
    key: string;
    label: string;
    monthlyAmount: number;
    percent: number;
    purpose: string;
    goalId?: string;
  }>;
  goals: Array<{
    id: string;
    name: string;
    monthlyAmount: number;
    currentAmount: number;
    targetAmount: number | null;
    targetDate: string | null;
    needsDiscovery: boolean;
    targetIssue: string | null;
    rationale: string;
    milestones: string[];
    nextQuestion: string;
  }>;
  emergency: { currentMonths: number; targetMonths: number; monthlyAmount: number };
  investing: { monthlyAmount: number; approach: string };
  guardrails: string[];
};

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0;
}

function normalized(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function monthsFromText(value: unknown) {
  const match = String(value || '').match(/\d+(?:[.,]\d+)?/);
  return match ? Math.max(0, Number(match[0].replace(',', '.'))) : 0;
}

function goalBlueprint(name: string) {
  const value = normalized(name);
  if (/independ|mudar|vivir solo|viaj/.test(value)) {
    return {
      milestones: ['Depósito, mudanza y equipamiento básico', 'Colchón para sostener la nueva vida', 'Viaje con destino, fecha y presupuesto propios'],
      question: '¿En qué ciudad quieres vivir, cuánto costaría la renta y qué viaje quieres hacer primero?',
      rationale: 'Es una meta compuesta: mudarte y viajar tienen costos, fechas y liquidez diferentes.',
    };
  }
  if (/propiedad|casa|departamento|inmueble/.test(value)) {
    return {
      milestones: ['Definir ciudad, tipo de propiedad y rango de precio', 'Construir enganche y gastos de compra', 'Validar mensualidad sostenible y fecha de compra'],
      question: '¿En qué ciudad y rango de precio imaginas la propiedad, y sería para vivir o invertir?',
      rationale: 'El monto depende del precio del inmueble, el enganche, los gastos de compra y la capacidad de pago.',
    };
  }
  if (/libertad financiera|libre financier/.test(value)) {
    return {
      milestones: ['Definir gasto mensual deseado', 'Fijar capital y fuentes de ingreso objetivo', 'Medir el avance anual del patrimonio'],
      question: '¿Qué gasto mensual quieres poder cubrir sin depender de tu trabajo activo?',
      rationale: 'La libertad financiera necesita una cifra de gasto mensual y una definición clara de independencia.',
    };
  }
  return {
    milestones: ['Definir el resultado concreto', 'Cotizar el costo real', 'Confirmar fecha y aportación mensual'],
    question: `¿Qué tendría que pasar exactamente para considerar cumplida la meta ${name}?`,
    rationale: 'Primero se define y cotiza el resultado; después se fija el monto.',
  };
}

export function buildGoalCfoPlan(input: {
  personalization: CfoPersonalization;
  goals: CfoGoalRow[];
  legacyGeneratedGoalIds?: Array<string | number>;
  essentialMonthlySpend?: number;
}): GoalCfoPlan {
  const capacity = money(input.personalization.monthly_goal_capacity);
  const goals = input.goals.filter((goal) => String(goal.name || '').trim());
  const legacyIds = new Set((input.legacyGeneratedGoalIds || []).map(String));
  const legacyGenerationDetected = legacyIds.size > goals.length;
  const currentEmergencyMonths = monthsFromText(input.personalization.emergency_fund_status);
  const variableIncome = /independ|freelance|autonom|variable|negocio|emprend/i.test(String(input.personalization.work_model || ''));
  const targetEmergencyMonths = variableIncome ? 6 : 4;
  const reservePercent = currentEmergencyMonths < targetEmergencyMonths ? 35 : 10;
  const beginner = /bas|princip|ninguna|empez/i.test(String(input.personalization.investment_experience || ''));
  const investingPercent = beginner ? 10 : 15;
  const goalsPercent = Math.max(0, 100 - reservePercent - investingPercent);
  const weights = goals.map((goal) => Math.max(1, 72 - Math.min(60, Number(goal.horizon_months || 36))));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const emergencyAmount = Math.round(capacity * reservePercent) / 100;
  const investingAmount = Math.round(capacity * investingPercent) / 100;

  const plannedGoals = goals.map((goal, index) => {
    const target = money(goal.target_amount);
    const legacyTarget = goal.source === 'personalization' && legacyGenerationDetected && legacyIds.has(String(goal.id)) && target > 0;
    const blueprint = goalBlueprint(goal.name);
    return {
      id: String(goal.id),
      name: String(goal.name),
      monthlyAmount: Math.round(capacity * goalsPercent * (weights[index] / totalWeight)) / 100,
      currentAmount: money(goal.current_amount),
      targetAmount: target > 0 && !legacyTarget ? target : null,
      targetDate: goal.target_date || null,
      needsDiscovery: target <= 0 || legacyTarget,
      targetIssue: legacyTarget ? 'El monto anterior fue generado por una fórmula antigua y no por el costo real de la meta.' : target <= 0 ? 'Falta cotizar y confirmar el costo real.' : null,
      rationale: blueprint.rationale,
      milestones: blueprint.milestones,
      nextQuestion: blueprint.question,
    };
  });

  const allocations = [
    {
      key: 'emergency', label: 'Fondo de emergencia', monthlyAmount: emergencyAmount, percent: reservePercent,
      purpose: currentEmergencyMonths < targetEmergencyMonths
        ? `Subir de ${currentEmergencyMonths || 0} a ${targetEmergencyMonths} meses de gastos esenciales.`
        : `Mantener al menos ${targetEmergencyMonths} meses de gastos esenciales líquidos.`,
    },
    ...plannedGoals.map((goal) => ({
      key: `goal:${goal.id}`, label: goal.name, monthlyAmount: goal.monthlyAmount,
      percent: capacity > 0 ? Math.round((goal.monthlyAmount / capacity) * 100) : 0,
      purpose: goal.needsDiscovery ? 'Apartado provisional mientras se define y cotiza la meta.' : 'Aportación calculada para avanzar hacia el monto confirmado.',
      goalId: goal.id,
    })),
    {
      key: 'investing', label: 'Inversión de largo plazo', monthlyAmount: investingAmount, percent: investingPercent,
      purpose: beginner
        ? 'Empezar con liquidez y diversificación; sin depender de cripto para cumplir metas cercanas.'
        : 'Construir patrimonio diversificado sin usar capital de metas cercanas.',
    },
  ];

  return {
    monthlyCapacity: capacity,
    summary: capacity > 0
      ? `Propuesta inicial para repartir $${capacity.toLocaleString('es-MX')} al mes sin confundir capacidad de ahorro con el precio de tus metas.`
      : 'Primero necesitamos definir cuánto puedes separar cada mes sin comprometer tus gastos esenciales.',
    allocations,
    goals: plannedGoals,
    emergency: { currentMonths: currentEmergencyMonths, targetMonths: targetEmergencyMonths, monthlyAmount: emergencyAmount },
    investing: {
      monthlyAmount: investingAmount,
      approach: beginner
        ? 'Instrumentos líquidos de bajo riesgo para la base y un fondo o ETF ampliamente diversificado para largo plazo.'
        : 'Base líquida y fondos o ETF diversificados, ajustados al plazo y tolerancia al riesgo.',
    },
    guardrails: [
      'Una recomendación no significa que el dinero ya se movió; el usuario confirma cada aportación.',
      'No se recomienda un activo específico sin revisar plazo, liquidez, comisiones, regulación y riesgo.',
      input.essentialMonthlySpend && input.essentialMonthlySpend > 0
        ? `El fondo de emergencia se debe validar contra aproximadamente $${money(input.essentialMonthlySpend).toLocaleString('es-MX')} de gasto esencial mensual observado.`
        : 'Falta validar el fondo de emergencia contra el gasto esencial mensual observado.',
    ],
  };
}
