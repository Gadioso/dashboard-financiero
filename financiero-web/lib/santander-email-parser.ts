import type { ClasificacionMovimiento } from '@/lib/financial-core';

export function tieneSenalSantander(raw: string) {
  return /\b(santander|banco santander|santander te informa|supernet|superm[oó]vil)\b/i.test(raw);
}

function normalizarMonto(valor: string) {
  return Number(valor.replace(/,/g, ''));
}

function limpiarConcepto(valor: string | undefined) {
  return (valor || 'Movimiento Santander')
    .replace(/^(el\s+)?comercio\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .trim();
}

function esTextoInformativoSantander(concepto: string) {
  return /\b(puedes consultar tus movimientos|desde tu celular|superm[oó]vil|consulta tus movimientos|servicio de alertas)\b/i.test(concepto);
}

function extraerMonto(texto: string) {
  const montoMatch = texto.match(/\$\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);

  return montoMatch ? normalizarMonto(montoMatch[1]) : 0;
}

function extraerConcepto(texto: string) {
  const comercioMatch =
    texto.match(/\bcompra\s+en\s+el\s+comercio\s+(.+?)(?:\s+con\s+tu\s+tarjeta|\s+por\s+un\s+monto|$)/i) ||
    texto.match(/\ben\s+(.+?)(?:\s+el\b|\s+al\b|\s+por\b|\s+con\b|$)/i) ||
    texto.match(/\bcomercio\s*[:\-]\s*(.+?)(?:\n|$)/i) ||
    texto.match(/\bconcepto\s*[:\-]\s*(.+?)(?:\n|$)/i);

  return limpiarConcepto(comercioMatch?.[1]);
}

function extraerFechaMovimiento(texto: string) {
  const match = texto.match(/\bEl\s+(\d{2})\/(\d{2})\/(\d{4})(?:\s+a\s+las\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+hrs?)?/i);

  if (!match) return undefined;

  const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
}

function clasificarComercio(concepto: string, texto: string) {
  const normalizado = `${concepto} ${texto}`.toLowerCase();

  if (/\b(gbm|cetes|casa de bolsa|kuspit|fintual|acciones|etf|inversi[oó]n)\b/i.test(normalizado)) {
    return {
      categoria: 'Futuro' as const,
      subcategoria: 'Inversion',
      razon: 'Comercio o concepto identificado como inversión/patrimonio.',
    };
  }

  if (/\b(starbucks|cafe|caf[eé]|restaurante|taquer|tacos|cine|bar|rappi|uber eats|netflix|spotify|concierto|viaje|hotel|muay thai)\b/i.test(normalizado)) {
    return {
      categoria: 'Placeres' as const,
      subcategoria: /\b(starbucks|cafe|caf[eé])\b/i.test(normalizado) ? 'Cafe' : 'Otros Placeres',
      razon: 'Comercio identificado como consumo discrecional o estilo de vida.',
    };
  }

  if (/\b(openai|chatgpt|codex|fiverr|opus|google|aws|vercel|github|software|notion|zoom|airtable|figma|canva|slack|discord|anthropic|claude|cursor|windsurf|replit|midjourney|runway|elevenlabs)\b/i.test(normalizado)) {
    return {
      categoria: 'Vida' as const,
      subcategoria: 'Herramientas Trabajo',
      razon: 'Comercio identificado como herramienta operativa/de trabajo.',
    };
  }

  if (/\b(oxxo|super|s[uú]per|farmacia|gasolina|uber\b|didi|metro|luz|agua|telcel|at[&y]t|movistar|internet|izzi|totalplay|telmex|doctor|hospital|carro|auto)\b/i.test(normalizado)) {
    return {
      categoria: 'Vida' as const,
      subcategoria: 'Costo de Vida',
      razon: 'Comercio identificado como gasto necesario o recurrente.',
    };
  }

  return {
    categoria: 'Vida' as const,
    subcategoria: 'Santander',
    razon: 'Movimiento Santander sin señal clara; se clasifica conservadoramente como costo de vida.',
  };
}

export function parsearCorreoSantander(raw: string): ClasificacionMovimiento | null {
  const texto = raw.replace(/\s+/g, ' ').trim();
  const normalizado = texto.toLowerCase();
  const monto = extraerMonto(texto);

  if (!tieneSenalSantander(texto)) return null;

  if (!Number.isFinite(monto) || monto <= 0) return null;

  const esEgreso = /(compra|cargo|retiro|pago|disposici[oó]n)/i.test(normalizado);
  const esIngreso = /(dep[oó]sito|deposito|abono|transferencia recibida|recibiste|te transfirieron|spei recibido)/i.test(normalizado);

  if (!esEgreso && !esIngreso) return null;

  const concepto = extraerConcepto(texto);
  const fechaMovimiento = extraerFechaMovimiento(texto);

  if (esTextoInformativoSantander(concepto) || (concepto === 'Movimiento Santander' && esTextoInformativoSantander(texto))) {
    return null;
  }

  if (esIngreso) {
    return {
      concepto,
      monto,
      tipo: 'ingreso',
      categoria: 'Futuro',
      subcategoria: 'Santander',
      razon: 'Detectado desde correo Santander como entrada de dinero.',
      fechaMovimiento,
    };
  }

  const clasificacion = clasificarComercio(concepto, texto);

  return {
    concepto,
    monto,
    tipo: 'gasto',
    categoria: clasificacion.categoria,
    subcategoria: clasificacion.subcategoria,
    razon: clasificacion.razon,
    fechaMovimiento,
  };
}
