-- Auth email templates use auth.users.user_metadata to choose the language.
-- Keep the same explicit preference on the profile for product/support flows.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_country_code_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_country_code_check
  CHECK (country_code IS NULL OR country_code IN ('MX', 'US'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_locale_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_locale_check
  CHECK (locale IS NULL OR locale IN ('es-MX', 'en-US'));
