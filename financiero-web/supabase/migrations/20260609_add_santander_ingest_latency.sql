ALTER TABLE IF EXISTS santander_ingest_logs
  ADD COLUMN IF NOT EXISTS gmail_received_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS apps_script_detected_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS backend_received_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS telegram_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ingest_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS telegram_latency_ms INTEGER;

CREATE INDEX IF NOT EXISTS santander_ingest_logs_backend_received_idx
  ON santander_ingest_logs (backend_received_at DESC);

CREATE INDEX IF NOT EXISTS santander_ingest_logs_ingest_latency_idx
  ON santander_ingest_logs (ingest_latency_ms DESC);
