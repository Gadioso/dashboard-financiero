CREATE TABLE IF NOT EXISTS abonos_tarjeta_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto TEXT NOT NULL,
  monto NUMERIC(12, 2) NOT NULL CHECK (monto > 0),
  tarjeta TEXT DEFAULT 'Tarjeta de crédito Santander',
  origen TEXT NOT NULL DEFAULT 'Santander_Email',
  fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS abonos_tarjeta_credito_fecha_idx
  ON abonos_tarjeta_credito (fecha DESC);

CREATE INDEX IF NOT EXISTS abonos_tarjeta_credito_concepto_monto_fecha_idx
  ON abonos_tarjeta_credito (concepto, monto, fecha);

ALTER TABLE santander_ingest_logs
  ADD COLUMN IF NOT EXISTS abono_tarjeta_id TEXT;

ALTER TABLE santander_ingest_logs
  DROP CONSTRAINT IF EXISTS santander_ingest_logs_movimiento_tipo_check;

ALTER TABLE santander_ingest_logs
  ADD CONSTRAINT santander_ingest_logs_movimiento_tipo_check
  CHECK (movimiento_tipo IS NULL OR movimiento_tipo IN ('gasto', 'ingreso', 'abono_tarjeta'));
