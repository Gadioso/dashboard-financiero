DO $$
DECLARE
  app_url_id uuid;
BEGIN
  SELECT id INTO app_url_id FROM vault.secrets WHERE name = 'daily_cfo_app_url' LIMIT 1;
  IF app_url_id IS NULL THEN
    PERFORM vault.create_secret(
      'https://dashboard-financiero-chi.vercel.app',
      'daily_cfo_app_url',
      'Stable Vercel alias for the daily CFO scheduler'
    );
  ELSE
    PERFORM vault.update_secret(
      app_url_id,
      'https://dashboard-financiero-chi.vercel.app',
      'daily_cfo_app_url',
      'Stable Vercel alias for the daily CFO scheduler'
    );
  END IF;
END $$;
