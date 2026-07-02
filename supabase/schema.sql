-- Weyra Atlas — first shared-observations schema
-- Run in Supabase SQL Editor. This is only appropriate for a small trusted beta.
-- Before public release: add authentication, ownership, moderation, rate limits and audit logging.

create extension if not exists pgcrypto;

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 24),
  category text not null check (category in ('pluie', 'orage', 'grêle', 'rafales', 'neige', 'nuage')),
  intensity smallint not null check (intensity between 1 and 5),
  details text check (details is null or char_length(details) <= 350),
  image_url text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  place text,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.observations enable row level security;

drop policy if exists "weyra beta read observations" on public.observations;
create policy "weyra beta read observations"
on public.observations for select to anon, authenticated
using (true);

drop policy if exists "weyra beta insert observations" on public.observations;
create policy "weyra beta insert observations"
on public.observations for insert to anon, authenticated
with check (
  char_length(nickname) between 1 and 24
  and intensity between 1 and 5
  and lat between -90 and 90
  and lng between -180 and 180
);

insert into storage.buckets (id, name, public)
values ('observation-media', 'observation-media', true)
on conflict (id) do update set public = true;

drop policy if exists "weyra beta upload observation media" on storage.objects;
create policy "weyra beta upload observation media"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'observation-media');

drop policy if exists "weyra beta read observation media" on storage.objects;
create policy "weyra beta read observation media"
on storage.objects for select to anon, authenticated
using (bucket_id = 'observation-media');

alter publication supabase_realtime add table public.observations;
