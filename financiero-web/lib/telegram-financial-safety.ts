function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * A correction must never be reinterpreted as a new financial movement just
 * because it contains a number. This is deliberately deterministic: the LLM
 * is not allowed to override an explicit "not an expense" instruction.
 */
export function isExplicitNonMovementCorrection(text: string) {
  const value = normalize(text);

  const saysNotNewMovement = /\b(?:no\s+(?:es|era|fue|quiero)\s+(?:un\s+)?(?:gasto|movimiento)|no\s+gasto|no\s+lo\s+(?:registres|registra)|ya\s+(?:esta|estan)\s+(?:dado|dados)\s+de\s+alta|no\s+quiero\s+que\s+(?:este|esten)\s+duplicad)/.test(value);
  const refersToPaymentOrDuplicate = /\b(?:abono|pago\s+(?:a|de)\s+tarjeta|duplicad)/.test(value);

  return saysNotNewMovement && refersToPaymentOrDuplicate;
}

export function isVoiceRetranscriptionRequest(text: string) {
  const value = normalize(text);

  return /\b(?:escucha(?:lo)?\s+(?:otra\s+vez|de\s+nuevo)|vuelve\s+a\s+escuchar(?:lo)?|retranscrib(?:e|elo)|transcrib(?:e|elo)\s+(?:otra\s+vez|de\s+nuevo))\b/.test(value);
}
