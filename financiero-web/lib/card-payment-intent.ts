const numberWords: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

const wordAlternatives = Object.keys(numberWords).join('|');
const wordAmountPattern = `(?:${wordAlternatives}|y|\\s)+`;

export function normalizarTextoFinanciero(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function numeroPalabrasBasico(texto: string) {
  const normalizado = normalizarTextoFinanciero(texto).replace(/\s+/g, ' ').trim();

  if (numberWords[normalizado]) return numberWords[normalizado];

  return normalizado
    .split(/\s+y\s+|\s+/)
    .reduce((total, parte) => total + (numberWords[parte] || 0), 0);
}

function extraerMontoEnPalabras(texto: string) {
  const normalizado = normalizarTextoFinanciero(texto);
  const milMatch = normalizado.match(new RegExp(`\\b(${wordAmountPattern})\\s+mil(?:\\s+pesos?)?\\b`));

  if (milMatch?.[1]) {
    const miles = numeroPalabrasBasico(milMatch[1]);
    if (miles > 0) return miles * 1000;
  }

  if (/\bmil(?:\s+pesos?)?\b/.test(normalizado)) return 1000;

  const pesosMatch = normalizado.match(new RegExp(`\\b(${wordAmountPattern})\\s+pesos?\\b`));

  return pesosMatch?.[1] ? numeroPalabrasBasico(pesosMatch[1]) : 0;
}

export function extraerMontoAbonoTarjeta(texto: string) {
  const normalizado = texto.toLowerCase();
  const milesMatch = normalizado.match(/\$?\s*(\d+(?:[,.]\d{1,2})?)\s*(?:k|mil)\b/);

  if (milesMatch?.[1]) {
    return Number(milesMatch[1].replace(',', '.')) * 1000;
  }

  const montoMatch = normalizado.match(/\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/);

  if (montoMatch) return Number(montoMatch[1].replace(/,/g, ''));

  return extraerMontoEnPalabras(texto);
}

export function esAbonoTarjetaCredito(texto: string) {
  const normalizado = normalizarTextoFinanciero(texto);
  const hasPaymentIntent = /\b(?:abono|abone|abonado|pague|pago|liquide|liquidacion|hice|hacer|mete|meti|meter|poner|aplicar|toma|tomar)\b/.test(normalizado);
  const hasRegisterIntent = /\b(?:agrega|agregar|anade|anadir|registra|registrar|registrame|guardar|guarda|mete|meti|hice|hacer|aplicar|aplica)\b/.test(normalizado);
  const hasGenericCardPaymentIntent = /\babono\b/.test(normalizado) && hasRegisterIntent && extraerMontoAbonoTarjeta(texto) > 0;
  const hasCardTarget = /\b(?:tarjeta(?:\s+de\s+credito)?|credito|tdc|la\s+de\s+credito)\b/.test(normalizado);
  const looksLikeIncome = /\b(?:ingreso|ingresos|deposito|depositaron|recibi|recibido|me\s+pagaron|cobre|cobro|sueldo|nomina|quincena|transferencia\s+recibida|spei\s+recibido)\b/.test(normalizado);

  return (hasPaymentIntent && hasCardTarget) || (hasGenericCardPaymentIntent && !looksLikeIncome);
}
