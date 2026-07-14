CREATE TABLE IF NOT EXISTS public.syncfy_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  syncfy_user_id text NOT NULL,
  id_external text NOT NULL,
  name text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (profile_id),
  UNIQUE (syncfy_user_id),
  UNIQUE (id_external)
);

CREATE INDEX IF NOT EXISTS syncfy_users_profile_id_idx
  ON public.syncfy_users(profile_id);

ALTER TABLE public.syncfy_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Syncfy users belong to authenticated profile" ON public.syncfy_users;
CREATE POLICY "Syncfy users belong to authenticated profile"
  ON public.syncfy_users
  FOR ALL
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));
