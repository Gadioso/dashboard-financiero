-- Retira el canal personal Gmail/Santander del modelo multiusuario.
-- Un registro creado desde un correo no se convierte en bancario cambiando su etiqueta.
-- Se conserva santander_ingest_logs como auditoría, pero se eliminan sus movimientos
-- para que gastos/abonos sólo contengan datos de los canales canónicos.

DELETE FROM public.gastos
WHERE origen = 'Santander_Email';

ALTER TABLE public.gastos
  DROP CONSTRAINT IF EXISTS gastos_origen_check;

ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_origen_check
  CHECK (origen IN ('Web', 'Telegram', 'Banco'));

DELETE FROM public.abonos_tarjeta_credito
WHERE origen = 'Santander_Email';

ALTER TABLE public.abonos_tarjeta_credito
  ALTER COLUMN origen SET DEFAULT 'Banco';

ALTER TABLE public.abonos_tarjeta_credito
  DROP CONSTRAINT IF EXISTS abonos_tarjeta_credito_origen_check;

ALTER TABLE public.abonos_tarjeta_credito
  ADD CONSTRAINT abonos_tarjeta_credito_origen_check
  CHECK (origen IN ('Web', 'Telegram', 'Banco'));
