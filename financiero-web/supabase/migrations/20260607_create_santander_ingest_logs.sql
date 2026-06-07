CREATE TABLE IF NOT EXISTS santander_ingest_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  gmail_message_id TEXT,
  from_email TEXT,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('inserted', 'duplicate', 'ignored', 'error')),
  reason TEXT,
  movimiento_tipo TEXT CHECK (movimiento_tipo IS NULL OR movimiento_tipo IN ('gasto', 'ingreso')),
  gasto_id TEXT,
  ingreso_id TEXT,
  concepto TEXT,
  monto NUMERIC(12, 2),
  categoria TEXT,
  subcategoria TEXT,
  telegram_notified BOOLEAN DEFAULT false,
  error TEXT
);

CREATE INDEX IF NOT EXISTS santander_ingest_logs_created_at_idx
  ON santander_ingest_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS santander_ingest_logs_gmail_message_id_idx
  ON santander_ingest_logs (gmail_message_id);
