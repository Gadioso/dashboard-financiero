alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists bio text,
  add column if not exists professional_headline text,
  add column if not exists location text,
  add column if not exists website_url text,
  add column if not exists financial_why text;

alter table public.profiles drop constraint if exists profiles_bio_length;
alter table public.profiles add constraint profiles_bio_length check (char_length(coalesce(bio, '')) <= 1200);
alter table public.profiles drop constraint if exists profiles_professional_headline_length;
alter table public.profiles add constraint profiles_professional_headline_length check (char_length(coalesce(professional_headline, '')) <= 160);
alter table public.profiles drop constraint if exists profiles_location_length;
alter table public.profiles add constraint profiles_location_length check (char_length(coalesce(location, '')) <= 160);
alter table public.profiles drop constraint if exists profiles_website_url_length;
alter table public.profiles add constraint profiles_website_url_length check (char_length(coalesce(website_url, '')) <= 500);
alter table public.profiles drop constraint if exists profiles_financial_why_length;
alter table public.profiles add constraint profiles_financial_why_length check (char_length(coalesce(financial_why, '')) <= 600);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their profile avatar" on storage.objects;
create policy "Users can read their profile avatar"
on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Users can upload their profile avatar" on storage.objects;
create policy "Users can upload their profile avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Users can update their profile avatar" on storage.objects;
create policy "Users can update their profile avatar"
on storage.objects for update to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Users can delete their profile avatar" on storage.objects;
create policy "Users can delete their profile avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
