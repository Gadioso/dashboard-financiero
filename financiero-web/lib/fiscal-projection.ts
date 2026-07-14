export type FiscalRegime = 'RESICO' | 'ACTIVIDAD_EMPRESARIAL' | 'PERSONA_MORAL';

export function projectionRegimeFromSatCode(value: string | null | undefined): FiscalRegime {
  if (value === '626' || value === 'RESICO') return 'RESICO';
  if (['601', '603', '620', '622', '623', '624'].includes(value || '') || value === 'PERSONA_MORAL') return 'PERSONA_MORAL';
  return 'ACTIVIDAD_EMPRESARIAL';
}

export type FiscalProjectionInput = {
  regime: FiscalRegime;
  collectedIncome: number;
  paidExpenses: number;
  vatTransferred: number;
  vatCreditable: number;
};

const resicoBands = [
  { limit: 25_000, rate: 0.01 },
  { limit: 50_000, rate: 0.011 },
  { limit: 83_333.33, rate: 0.015 },
  { limit: 208_333.33, rate: 0.02 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.025 },
] as const;

function money(value: number) {
  return Number(Math.max(0, Number.isFinite(value) ? value : 0).toFixed(2));
}

export function calculateFiscalProjection(input: FiscalProjectionInput) {
  const income = money(input.collectedIncome);
  const expenses = money(input.paidExpenses);
  const taxableProfit = money(income - expenses);
  const resicoRate = resicoBands.find((band) => income <= band.limit)?.rate || 0.025;
  const incomeTaxRate = input.regime === 'RESICO' ? resicoRate : input.regime === 'PERSONA_MORAL' ? 0.30 : 0.30;
  const incomeTaxBase = input.regime === 'RESICO' ? income : taxableProfit;
  const estimatedIncomeTax = money(incomeTaxBase * incomeTaxRate);
  const estimatedVat = money(input.vatTransferred - input.vatCreditable);

  return {
    regime: input.regime,
    collectedIncome: income,
    paidExpenses: expenses,
    taxableProfit,
    incomeTaxRate,
    estimatedIncomeTax,
    vatTransferred: money(input.vatTransferred),
    vatCreditable: money(input.vatCreditable),
    estimatedVat,
    estimatedTotal: money(estimatedIncomeTax + estimatedVat),
    disclaimer: 'Estimación informativa. No sustituye el cálculo ni la declaración de un contador.',
  };
}
