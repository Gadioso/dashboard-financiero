CREATE TABLE IF NOT EXISTS telegram_memoria (
  chat_id TEXT PRIMARY KEY,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS telegram_memoria_updated_at_idx
  ON telegram_memoria (updated_at DESC);
