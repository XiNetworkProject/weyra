begin;

create schema if not exists extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.profile_role as enum (
  'member',
  'reliable',
  'creator',
  'association',
  'moderator',
  'admin'
);

create type public.content_visibility as enum (
  'public',
  'community',
  'unlisted',
  'private'
);

create type public.content_status as enum (
  'draft',
  'pending',
  'published',
  'limited',
  'rejected',
  'archived',
  'deleted'
);

create type public.observation_category as enum (
  'pluie',
  'orage',
  'foudre',
  'grele',
  'rafales',
  'tornade',
  'neige',
  'verglas',
  'brouillard',
  'inondation',
  'chaleur',
  'froid',
  'nuage',
  'arc-en-ciel'
);

create type public.observation_verification as enum (
  'unconfirmed',
  'corroborated',
  'verified',
  'disputed'
);

create type public.post_kind as enum (
  'observation',
  'photo',
  'analysis',
  'question',
  'recap'
);

create type public.media_kind as enum (
  'avatar',
  'image',
  'video',
  'document'
);

create type public.media_moderation_status as enum (
  'uploading',
  'pending',
  'approved',
  'rejected',
  'quarantined'
);

create type public.community_access as enum (
  'public',
  'request',
  'private'
);

create type public.community_template as enum (
  'local',
  'weather',
  'association',
  'media',
  'field',
  'photography',
  'event'
);

create type public.community_space_type as enum (
  'discussion',
  'observations',
  'atlas',
  'media',
  'event',
  'announcement',
  'resource'
);

create type public.space_visibility as enum (
  'public',
  'members',
  'role',
  'private'
);

create type public.membership_status as enum (
  'pending',
  'joined',
  'invited',
  'declined',
  'left',
  'suspended',
  'banned'
);

create type public.notification_mode as enum (
  'all',
  'essential',
  'custom',
  'silent'
);

create type public.event_access as enum (
  'public',
  'members',
  'private'
);

create type public.event_format as enum (
  'online',
  'onsite',
  'hybrid'
);

create type public.message_kind as enum (
  'message',
  'announcement',
  'observation',
  'resource',
  'confirmation',
  'source'
);

create type public.room_status as enum (
  'watching',
  'active',
  'archived'
);

create type public.notification_type as enum (
  'reply',
  'mention',
  'event',
  'observation',
  'membership',
  'moderation',
  'security'
);

create type public.priority_level as enum (
  'critical',
  'urgent',
  'high',
  'normal',
  'low'
);

create type public.moderation_category as enum (
  'safety',
  'harassment',
  'misinformation',
  'spam',
  'quality',
  'privacy',
  'copyright'
);

create type public.moderation_status as enum (
  'open',
  'reviewing',
  'resolved',
  'appealed',
  'closed'
);

create type public.moderation_action as enum (
  'educate',
  'limit',
  'warn',
  'suspend',
  'ban',
  'dismiss',
  'remove'
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle extensions.citext not null unique,
  display_name text not null,
  bio text not null default '',
  region text not null default '',
  role public.profile_role not null default 'member',
  accent text not null default '#62f2dc',
  avatar_path text,
  locale text not null default 'fr-FR',
  interests public.observation_category[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_handle_length check (char_length(handle::text) between 3 and 32),
  constraint profiles_handle_format check (handle::text ~ '^[a-z0-9_]+$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 48),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_region_length check (char_length(region) <= 120),
  constraint profiles_accent_format check (accent ~ '^#[0-9a-fA-F]{6}$'),
  constraint profiles_locale_allowed check (locale in ('fr-FR', 'en-GB'))
);

create index profiles_role_idx on public.profiles(role);
create index profiles_created_at_idx on public.profiles(created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create table public.profile_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  compact_mode boolean not null default false,
  reduce_motion boolean not null default false,
  high_contrast boolean not null default false,
  temperature_unit text not null default 'celsius',
  wind_unit text not null default 'kmh',
  alert_enabled boolean not null default true,
  alert_radius_km smallint not null default 20,
  quiet_hours boolean not null default true,
  quiet_from time not null default '23:00',
  quiet_to time not null default '07:00',
  alert_phenomena public.observation_category[] not null default '{orage,pluie,grele,rafales}',
  community_activity boolean not null default true,
  official_information boolean not null default true,
  daily_recap boolean not null default false,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_preferences_temperature_unit check (temperature_unit in ('celsius', 'fahrenheit')),
  constraint profile_preferences_wind_unit check (wind_unit in ('kmh', 'ms')),
  constraint profile_preferences_alert_radius check (alert_radius_km between 2 and 100),
  constraint profile_preferences_settings_object check (jsonb_typeof(settings) = 'object')
);

create trigger profile_preferences_set_updated_at
before update on public.profile_preferences
for each row execute function private.set_updated_at();

create table public.saved_places (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  country text not null default '',
  admin_area text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  position extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
    ) stored,
  is_primary boolean not null default false,
  alert_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_places_name_length check (char_length(name) between 1 and 100),
  constraint saved_places_latitude check (latitude between -90 and 90),
  constraint saved_places_longitude check (longitude between -180 and 180),
  unique (user_id, name)
);

create index saved_places_user_idx on public.saved_places(user_id, created_at desc);
create index saved_places_position_idx on public.saved_places using gist(position);

create trigger saved_places_set_updated_at
before update on public.saved_places
for each row execute function private.set_updated_at();

create table public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint user_follows_not_self check (follower_id <> followed_id)
);

create index user_follows_followed_idx on public.user_follows(followed_id, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  handle_seed text;
begin
  requested_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Membre Weyra'
  );

  handle_seed := lower(regexp_replace(split_part(requested_name, ' ', 1), '[^a-zA-Z0-9_]+', '', 'g'));
  if char_length(handle_seed) < 3 then
    handle_seed := 'weyra';
  end if;

  insert into public.profiles (
    id,
    handle,
    display_name,
    avatar_path
  )
  values (
    new.id,
    left(handle_seed, 23) || '_' || left(replace(new.id::text, '-', ''), 8),
    left(requested_name, 48),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.profile_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.profile_preferences enable row level security;
alter table public.saved_places enable row level security;
alter table public.user_follows enable row level security;
alter table public.user_blocks enable row level security;

create policy profiles_public_read
on public.profiles for select
to anon, authenticated
using (deleted_at is null);

create policy profiles_insert_self
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy profiles_update_self
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profile_preferences_self
on public.profile_preferences for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy saved_places_self
on public.saved_places for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy user_follows_visible_to_participants
on public.user_follows for select
to authenticated
using ((select auth.uid()) in (follower_id, followed_id));

create policy user_follows_insert_self
on public.user_follows for insert
to authenticated
with check ((select auth.uid()) = follower_id);

create policy user_follows_delete_self
on public.user_follows for delete
to authenticated
using ((select auth.uid()) = follower_id);

create policy user_blocks_self
on public.user_blocks for all
to authenticated
using ((select auth.uid()) = blocker_id)
with check ((select auth.uid()) = blocker_id);

revoke all on public.profiles from anon, authenticated;
revoke all on public.profile_preferences from anon, authenticated;
revoke all on public.saved_places from anon, authenticated;
revoke all on public.user_follows from anon, authenticated;
revoke all on public.user_blocks from anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert (id, handle, display_name, bio, region, accent, avatar_path, locale, interests, onboarding_completed)
  on public.profiles to authenticated;
grant update (handle, display_name, bio, region, accent, avatar_path, locale, interests, onboarding_completed, deleted_at)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.profile_preferences to authenticated;
grant select, insert, update, delete on public.saved_places to authenticated;
grant select, insert, delete on public.user_follows to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

commit;
