export type WealthExperience = 'beginner' | 'intermediate' | 'experienced';
export type WealthRiskTolerance = 'conservative' | 'balanced' | 'aggressive';
export type WealthHorizon = 'short' | 'medium' | 'long';

export type WealthGoalInput = {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  targetDate?: string | null;
  horizonMonths: number;
};

export type WealthRouteInput = {
  experienceLevel: WealthExperience;
  monthlyContribution: number;
  riskTolerance: WealthRiskTolerance;
  horizon: WealthHorizon;
  emergencyFundMonths: number;
  allowCrypto: boolean;
  allowPredictionMarkets: boolean;
  noLeverage: boolean;
  monthlyIncomeTarget?: number;
  goals?: WealthGoalInput[];
};

export type WealthAllocation = {
  key: 'reserve' | 'diversified' | 'growth' | 'crypto' | 'prediction';
  label: string;
  percent: number;
  monthlyAmount: number;
  purpose: string;
  platform: string;
};

export type WealthRoutePlan = {
  profileLabel: string;
  summary: string;
  monthlyContribution: number;
  weeklyContribution: number;
  goals: Array<{
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    remainingAmount: number;
    progressPct: number;
    monthsRemaining: number;
    requiredMonthly: number;
    suggestedMonthly: number;
    targetDate?: string | null;
  }>;
  allocations: WealthAllocation[];
  steps: Array<{ order: number; title: string; description: string; action: string }>;
  guardrails: string[];
  integrationPath: Array<{
    provider: 'Binance' | 'Polymarket' | 'Alpaca';
    status: 'market_data' | 'partner_required' | 'wallet_required';
    description: string;
    url: string;
  }>;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizePercentages(values: Record<WealthAllocation['key'], number>) {
  const entries = Object.entries(values) as Array<[WealthAllocation['key'], number]>;
  const positive = entries.map(([key, value]) => [key, Math.max(0, value)] as const);
  const total = positive.reduce((sum, [, value]) => sum + value, 0) || 1;
  const normalized = positive.map(([key, value]) => [key, Math.round((value / total) * 100)] as [WealthAllocation['key'], number]);
  const difference = 100 - normalized.reduce((sum, [, value]) => sum + value, 0);
  const largestIndex = normalized.reduce((best, item, index, list) => item[1] > list[best][1] ? index : best, 0);
  normalized[largestIndex][1] += difference;
  return Object.fromEntries(normalized) as Record<WealthAllocation['key'], number>;
}

export function buildWealthRoute(input: WealthRouteInput): WealthRoutePlan {
  const contribution = Math.max(0, Number(input.monthlyContribution) || 0);
  const beginner = input.experienceLevel === 'beginner';
  const experienced = input.experienceLevel === 'experienced';
  const shortHorizon = input.horizon === 'short';

  let weights: Record<WealthAllocation['key'], number> = input.riskTolerance === 'conservative'
    ? { reserve: 55, diversified: 35, growth: 10, crypto: 0, prediction: 0 }
    : input.riskTolerance === 'aggressive'
      ? { reserve: 20, diversified: 40, growth: 25, crypto: 15, prediction: 0 }
      : { reserve: 35, diversified: 45, growth: 15, crypto: 5, prediction: 0 };

  if (beginner) {
    weights.reserve += 15;
    weights.growth -= 5;
    weights.crypto = Math.min(weights.crypto, 3);
  } else if (experienced && input.riskTolerance !== 'conservative') {
    weights.reserve -= 10;
    weights.diversified += 5;
    weights.growth += 5;
  }

  if (shortHorizon) {
    weights.reserve += 25;
    weights.growth = Math.max(0, weights.growth - 15);
    weights.crypto = 0;
  } else if (input.horizon === 'long') {
    weights.reserve = Math.max(15, weights.reserve - 10);
    weights.diversified += 7;
    weights.growth += 3;
  }

  if (!input.allowCrypto) weights.crypto = 0;
  if (input.allowPredictionMarkets && experienced && input.riskTolerance === 'aggressive' && !shortHorizon) {
    weights.prediction = 2;
    weights.growth = Math.max(0, weights.growth - 2);
  }
  weights = normalizePercentages(weights);

  const catalog: Record<WealthAllocation['key'], Omit<WealthAllocation, 'key' | 'percent' | 'monthlyAmount'>> = {
    reserve: { label: 'Base y liquidez', purpose: `Construir una reserva de ${input.emergencyFundMonths} meses antes de aumentar riesgo.`, platform: 'Cuenta remunerada, CETES o instrumento líquido equivalente' },
    diversified: { label: 'Inversión diversificada', purpose: 'Repartir el riesgo entre muchos activos para el mediano y largo plazo.', platform: 'Fondo o ETF diversificado mediante una plataforma regulada' },
    growth: { label: 'Crecimiento', purpose: 'Buscar crecimiento con una porción limitada y sin concentrar todo en una posición.', platform: 'ETF de renta variable o portafolio diversificado' },
    crypto: { label: 'Cripto', purpose: 'Exposición pequeña, volátil y prescindible para la meta principal.', platform: 'Binance u otra plataforma disponible en tu región' },
    prediction: { label: 'Mercados predictivos', purpose: 'Aprendizaje experimental; nunca se usa como base patrimonial.', platform: 'Polymarket, sujeto a disponibilidad geográfica' },
  };

  const allocations = (Object.keys(weights) as WealthAllocation['key'][])
    .filter((key) => weights[key] > 0)
    .map((key) => ({ key, ...catalog[key], percent: weights[key], monthlyAmount: roundMoney(contribution * weights[key] / 100) }));
  const weeklyContribution = roundMoney(contribution * 12 / 52);
  const profileLabel = beginner ? 'Ruta guiada para comenzar' : experienced ? 'Ruta avanzada con límites' : 'Ruta de crecimiento acompañada';
  const goalInputs = (input.goals || []).filter((goal) => goal.name.trim());
  const goalNeeds = goalInputs.map((goal) => {
    const remainingAmount = Math.max(0, Number(goal.targetAmount || 0) - Number(goal.currentAmount || 0));
    const monthsRemaining = Math.max(1, Number(goal.horizonMonths || 0) || 12);
    return {
      ...goal,
      remainingAmount,
      monthsRemaining,
      requiredMonthly: roundMoney(remainingAmount / monthsRemaining),
    };
  });
  const totalRequiredMonthly = goalNeeds.reduce((sum, goal) => sum + goal.requiredMonthly, 0);
  const equalShare = goalNeeds.length > 0 ? contribution / goalNeeds.length : 0;
  const goals = goalNeeds.map((goal) => ({
    id: goal.id,
    name: goal.name,
    currentAmount: roundMoney(Number(goal.currentAmount || 0)),
    targetAmount: roundMoney(Number(goal.targetAmount || 0)),
    remainingAmount: roundMoney(goal.remainingAmount),
    progressPct: goal.targetAmount > 0 ? Math.min(100, Math.round((Number(goal.currentAmount || 0) / Number(goal.targetAmount)) * 100)) : 0,
    monthsRemaining: goal.monthsRemaining,
    requiredMonthly: goal.requiredMonthly,
    suggestedMonthly: roundMoney(totalRequiredMonthly > 0 ? contribution * (goal.requiredMonthly / totalRequiredMonthly) : equalShare),
    targetDate: goal.targetDate || null,
  }));
  const primaryGoal = goals[0];

  return {
    profileLabel,
    summary: contribution > 0 && goals.length > 0
      ? `Distribuimos $${roundMoney(contribution).toLocaleString('es-MX')} al mes entre ${goals.length} meta${goals.length === 1 ? '' : 's'} y elegimos inversiones compatibles con cada plazo.`
      : contribution > 0
        ? `Distribuimos $${roundMoney(contribution).toLocaleString('es-MX')} al mes para proteger tu base y hacer crecer tu patrimonio de forma gradual.`
      : 'Define una aportación mensual para convertir los porcentajes en cantidades concretas.',
    monthlyContribution: contribution,
    weeklyContribution,
    goals,
    allocations,
    steps: [
      { order: 1, title: primaryGoal ? `Empieza por ${primaryGoal.name}` : 'Protege tu base', description: primaryGoal ? `Destina $${primaryGoal.suggestedMonthly.toLocaleString('es-MX')} al mes a esta meta y revisa el avance cada mes.` : `Separa primero ${weights.reserve}% de cada aportación hasta completar ${input.emergencyFundMonths} meses de reserva.`, action: 'protect' },
      { order: 2, title: 'Automatiza la aportación', description: `Programa aproximadamente $${weeklyContribution.toLocaleString('es-MX')} por semana o $${contribution.toLocaleString('es-MX')} al mes para tus metas.`, action: 'automate' },
      { order: 3, title: beginner ? 'Aprende antes de comprar' : 'Compara instrumentos', description: beginner ? 'Aprende liquidez, diversificación, volatilidad y comisiones con ejemplos simples.' : 'Compara costo, liquidez, diversificación y riesgo; no elijas solo por rendimiento reciente.', action: 'learn' },
      { order: 4, title: 'Simula una semana', description: 'Usa paper trading para entender la variación antes de mover dinero real.', action: 'simulate' },
      { order: 5, title: 'Conecta una plataforma', description: 'Empieza con lectura o un enlace oficial. La ejecución real exige confirmación explícita.', action: 'connect' },
    ],
    guardrails: [
      input.noLeverage ? 'Sin apalancamiento.' : 'El apalancamiento no se incluye en esta ruta.',
      beginner ? 'No se habilita ejecución automática para perfiles principiantes.' : 'Toda orden real requiere confirmación humana.',
      'Esto es información educativa y una simulación de ruta, no asesoría financiera personalizada.',
    ],
    integrationPath: [
      { provider: 'Binance', status: 'partner_required', description: 'Datos públicos disponibles. Trading requiere permiso TRADE; OAuth de terceros requiere acceso de partner.', url: 'https://developers.binance.com/en/docs/products/spot/rest-api' },
      { provider: 'Polymarket', status: 'wallet_required', description: 'Datos públicos disponibles. Operar requiere wallet, firma EIP-712 y credenciales CLOB, sujeto a la región.', url: 'https://docs.polymarket.com/trading/overview' },
      { provider: 'Alpaca', status: 'partner_required', description: 'Market Data, Trading y Broker API para acciones y cripto; requiere onboarding comercial.', url: 'https://docs.alpaca.markets/' },
    ],
  };
}
