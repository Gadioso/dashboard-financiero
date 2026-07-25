-- Historial legado normalizado. Default historical expenses to Placeres unless they are clear productive tools,
-- investments, emergency fund, or insurance.

DO $$
DECLARE
  tool_pattern text := '(openai|chatgpt|codex|twilio|fiverr|opus|google|google[[:space:]_-]*cloud|gcp|aws|azure|cloud|vercel|github|software|saas|notion|zoom|airtable|figma|canva|slack|discord|anthropic|claude|cursor|windsurf|replit|midjourney|runway|elevenlabs|perplexity|lovable|supabase|firebase|cloudflare|digitalocean|railway|render|heroku|zapier|make|linear|asana|trello|jira|microsoft|adobe|heygen|capcut|gemini)';
  investment_pattern text := '(gbm|cetes|casa[[:space:]_-]*de[[:space:]_-]*bolsa|kuspit|fintual|acciones|etf|inversi[oó]n|invert|crypto|bitcoin)';
  emergency_pattern text := '(emergencia|fondo[[:space:]_-]*de[[:space:]_-]*emergencia|escudo)';
  insurance_pattern text := '(seguro|seguros|segmonterrey|monterrey[[:space:]_-]*new[[:space:]_-]*york|gnp|axa|qualitas|qu[aá]litas|mapfre|metlife|nyl)';
BEGIN
  IF to_regclass('public.gastos') IS NOT NULL THEN
    UPDATE public.gastos
    SET
      categoria = 'Placeres',
      subcategoria = 'Otros Placeres'
    WHERE NOT (
      coalesce(concepto, '') ~* tool_pattern
      OR coalesce(concepto, '') ~* investment_pattern
      OR coalesce(concepto, '') ~* emergency_pattern
      OR coalesce(concepto, '') ~* insurance_pattern
      OR coalesce(subcategoria, '') ~* '(herramientas|inversion|emergencia|seguros)'
    );

    UPDATE public.gastos
    SET categoria = 'Seguros', subcategoria = 'Herramientas Software'
    WHERE coalesce(concepto, '') ~* tool_pattern OR coalesce(subcategoria, '') ~* 'herramientas';

    UPDATE public.gastos
    SET categoria = 'Seguros', subcategoria = 'Inversion'
    WHERE coalesce(concepto, '') ~* investment_pattern;

    UPDATE public.gastos
    SET categoria = 'Seguros', subcategoria = 'Emergencia'
    WHERE coalesce(concepto, '') ~* emergency_pattern;

    UPDATE public.gastos
    SET categoria = 'Seguros', subcategoria = 'Seguros'
    WHERE coalesce(concepto, '') ~* insurance_pattern;
  END IF;

  IF to_regclass('public.classification_preferences') IS NOT NULL THEN
    UPDATE public.classification_preferences
    SET
      categoria = 'Placeres',
      subcategoria = 'Otros Placeres',
      updated_at = timezone('utc'::text, now())
    WHERE NOT (
      coalesce(matcher, '') ~* tool_pattern
      OR coalesce(matcher, '') ~* investment_pattern
      OR coalesce(matcher, '') ~* emergency_pattern
      OR coalesce(matcher, '') ~* insurance_pattern
      OR coalesce(subcategoria, '') ~* '(herramientas|inversion|emergencia|seguros)'
    );

    UPDATE public.classification_preferences
    SET categoria = 'Futuro', subcategoria = 'Herramientas Software', updated_at = timezone('utc'::text, now())
    WHERE coalesce(matcher, '') ~* tool_pattern OR coalesce(subcategoria, '') ~* 'herramientas';

    UPDATE public.classification_preferences
    SET categoria = 'Futuro', subcategoria = 'Inversion', updated_at = timezone('utc'::text, now())
    WHERE coalesce(matcher, '') ~* investment_pattern;

    UPDATE public.classification_preferences
    SET categoria = 'Futuro', subcategoria = 'Emergencia', updated_at = timezone('utc'::text, now())
    WHERE coalesce(matcher, '') ~* emergency_pattern;

    UPDATE public.classification_preferences
    SET categoria = 'Futuro', subcategoria = 'Seguros', updated_at = timezone('utc'::text, now())
    WHERE coalesce(matcher, '') ~* insurance_pattern;
  END IF;

  IF to_regclass('public.santander_ingest_logs') IS NOT NULL THEN
    UPDATE public.santander_ingest_logs
    SET categoria = 'Placeres', subcategoria = 'Otros Placeres'
    WHERE movimiento_tipo = 'gasto'
      AND NOT (
        coalesce(concepto, '') ~* tool_pattern
        OR coalesce(concepto, '') ~* investment_pattern
        OR coalesce(concepto, '') ~* emergency_pattern
        OR coalesce(concepto, '') ~* insurance_pattern
        OR coalesce(subcategoria, '') ~* '(herramientas|inversion|emergencia|seguros)'
      );

    UPDATE public.santander_ingest_logs
    SET categoria = 'Futuro', subcategoria = 'Herramientas Software'
    WHERE movimiento_tipo = 'gasto'
      AND (coalesce(concepto, '') ~* tool_pattern OR coalesce(subcategoria, '') ~* 'herramientas');

    UPDATE public.santander_ingest_logs
    SET categoria = 'Futuro', subcategoria = 'Inversion'
    WHERE movimiento_tipo = 'gasto'
      AND coalesce(concepto, '') ~* investment_pattern;

    UPDATE public.santander_ingest_logs
    SET categoria = 'Futuro', subcategoria = 'Emergencia'
    WHERE movimiento_tipo = 'gasto'
      AND coalesce(concepto, '') ~* emergency_pattern;

    UPDATE public.santander_ingest_logs
    SET categoria = 'Futuro', subcategoria = 'Seguros'
    WHERE movimiento_tipo = 'gasto'
      AND coalesce(concepto, '') ~* insurance_pattern;
  END IF;
END $$;
