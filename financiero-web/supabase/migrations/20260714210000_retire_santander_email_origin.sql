-- Retira el canal personal Gmail/Santander hacia adelante.
-- El histórico anterior al 10 de julio de 2026 pertenece al dashboard personal
-- y debe conservarse. Desde el corte, los movimientos nuevos sólo llegan por banco,
-- Telegram o web.

BEGIN;

DELETE FROM public.gastos
WHERE origen = 'Santander_Email'
  AND fecha >= timestamptz '2026-07-10 00:00:00-06';

COMMIT;
