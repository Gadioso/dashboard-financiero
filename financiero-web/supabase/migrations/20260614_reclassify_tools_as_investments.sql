-- Reclassify productive tools/software/cloud/AI expenses as investments.
-- Business rule: strict cost of living stays in Vida; tools that help build or
-- operate the business/product count toward Futuro/Inversion.

DO $$
DECLARE
  tool_pattern text := '(openai|chatgpt|codex|fiverr|opus|google|google[[:space:]_-]*cloud|gcp|aws|azure|cloud|vercel|github|software|saas|notion|zoom|airtable|figma|canva|slack|discord|anthropic|claude|cursor|windsurf|replit|midjourney|runway|elevenlabs|perplexity|lovable|supabase|firebase|cloudflare|digitalocean|railway|render|heroku|zapier|linear|asana|trello|jira|microsoft|adobe|heygen|capcut|gemini)';
BEGIN
  IF to_regclass('public.gastos') IS NOT NULL THEN
    UPDATE public.gastos
    SET
      categoria = 'Seguros',
      subcategoria = 'Inversion'
    WHERE
      (
        coalesce(concepto, '') ~* tool_pattern
        OR coalesce(subcategoria, '') ~* 'herramientas'
      )
      AND (
        coalesce(categoria, '') <> 'Seguros'
        OR coalesce(subcategoria, '') <> 'Inversion'
      );
  END IF;

  IF to_regclass('public.classification_preferences') IS NOT NULL THEN
    UPDATE public.classification_preferences
    SET
      categoria = 'Futuro',
      subcategoria = 'Inversion',
      updated_at = timezone('utc'::text, now())
    WHERE
      (
        coalesce(matcher, '') ~* tool_pattern
        OR coalesce(subcategoria, '') ~* 'herramientas'
      )
      AND (
        coalesce(categoria, '') <> 'Futuro'
        OR coalesce(subcategoria, '') <> 'Inversion'
      );
  END IF;

  IF to_regclass('public.santander_ingest_logs') IS NOT NULL THEN
    UPDATE public.santander_ingest_logs
    SET
      categoria = 'Futuro',
      subcategoria = 'Inversion'
    WHERE
      (
        coalesce(concepto, '') ~* tool_pattern
        OR coalesce(subcategoria, '') ~* 'herramientas'
      )
      AND (
        coalesce(categoria, '') <> 'Futuro'
        OR coalesce(subcategoria, '') <> 'Inversion'
      );
  END IF;
END $$;
