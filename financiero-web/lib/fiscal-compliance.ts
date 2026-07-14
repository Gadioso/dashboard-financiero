export type FiscalComplianceInterpretation = {
  status: 'positive' | 'negative' | 'unavailable';
  omittedObligations: string[];
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
};

const positivePatterns = [
  /opini[oó]n\s+(?:(?:de|del)\s+)?cumplimiento\s+positiva/i,
  /opini[oó]n\s+positiva/i,
  /sentido\s*[:=-]?\s*positivo/i,
  /resultado\s*[:=-]?\s*positivo/i,
  /cumplimiento\s*[:=-]?\s*positivo/i,
];

const negativePatterns = [
  /opini[oó]n\s+(?:(?:de|del)\s+)?cumplimiento\s+negativa/i,
  /opini[oó]n\s+negativa/i,
  /sentido\s*[:=-]?\s*negativo/i,
  /resultado\s*[:=-]?\s*negativo/i,
  /cumplimiento\s*[:=-]?\s*negativo/i,
  /(?:obligaciones?|cr[eé]ditos?\s+fiscales?)\s+(?:fiscales?\s+)?(?:omitidas?|incumplidas?|pendientes?)/i,
];

const obligationKeys = new Set([
  'omittedobligations',
  'obligacionesomitidas',
  'obligacionesincumplidas',
  'missingobligations',
  'obligacionespendientes',
]);

function normalizedKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function collectText(value: unknown, output: string[], depth = 0) {
  if (depth > 8 || output.length >= 250 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    const clean = value.replace(/\s+/g, ' ').trim();
    if (clean) output.push(clean.slice(0, 2_000));
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      output.push(key);
      collectText(item, output, depth + 1);
    });
  }
}

function collectObligations(value: unknown, output: string[], depth = 0) {
  if (depth > 8 || !value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (obligationKeys.has(normalizedKey(key))) {
      const candidates: string[] = [];
      collectText(item, candidates);
      candidates.forEach((candidate) => {
        if (candidate.length >= 3 && candidate.length <= 500) output.push(candidate);
      });
    }
    collectObligations(item, output, depth + 1);
  }
}

export function interpretFiscalComplianceOpinion(value: unknown): FiscalComplianceInterpretation {
  const text: string[] = [];
  collectText(value, text);
  const corpus = text.join('\n');
  const negativeEvidence = negativePatterns.flatMap((pattern) => corpus.match(pattern)?.[0] || []);
  const positiveEvidence = positivePatterns.flatMap((pattern) => corpus.match(pattern)?.[0] || []);
  const omittedObligations: string[] = [];
  collectObligations(value, omittedObligations);
  const uniqueObligations = [...new Set(omittedObligations)].slice(0, 50);

  if (negativeEvidence.length || uniqueObligations.length) {
    return {
      status: 'negative',
      omittedObligations: uniqueObligations,
      evidence: [...new Set(negativeEvidence)].slice(0, 10),
      confidence: negativeEvidence.length ? 'high' : 'medium',
    };
  }
  if (positiveEvidence.length) {
    return {
      status: 'positive',
      omittedObligations: [],
      evidence: [...new Set(positiveEvidence)].slice(0, 10),
      confidence: 'high',
    };
  }
  return { status: 'unavailable', omittedObligations: [], evidence: [], confidence: 'low' };
}
