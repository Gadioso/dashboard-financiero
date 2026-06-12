-- Self-serve onboarding integrations for Telegram and Gmail OAuth.

CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  claimed_chat_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS telegram_link_codes_profile_idx
  ON telegram_link_codes(profile_id, created_at DESC);

ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Telegram link codes belong to profile" ON telegram_link_codes;
CREATE POLICY "Telegram link codes belong to profile"
  ON telegram_link_codes FOR ALL
  USING (profile_id = (select auth.uid()))
  WITH CHECK (profile_id = (select auth.uid()));

ALTER TABLE gmail_integrations ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT;
ALTER TABLE gmail_integrations ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
ALTER TABLE gmail_integrations ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE gmail_integrations ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE gmail_integrations ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
ALTER TABLE gmail_integrations ADD COLUMN IF NOT EXISTS oauth_provider TEXT DEFAULT 'google';

CREATE INDEX IF NOT EXISTS gmail_integrations_status_watch_idx
  ON gmail_integrations(status, watch_expires_at);
