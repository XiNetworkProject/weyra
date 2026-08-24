begin;

create table public.media_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  kind public.media_kind not null default 'image',
  moderation_status public.media_moderation_status not null default 'uploading',
  visibility public.content_visibility not null default 'private',
  mime_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  duration_seconds numeric(8, 2),
  alt_text text not null default '',
  rights_confirmed boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  constraint media_assets_bucket_length check (char_length(bucket_id) between 1 and 80),
  constraint media_assets_path_length check (char_length(object_path) between 1 and 500),
  constraint media_assets_mime_length check (char_length(mime_type) between 3 and 120),
  constraint media_assets_size check (byte_size between 1 and 52428800),
  constraint media_assets_dimensions check (
    (width is null and height is null)
    or (width between 1 and 20000 and height between 1 and 20000)
  ),
  constraint media_assets_alt_length check (char_length(alt_text) <= 500),
  constraint media_assets_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index media_assets_owner_idx on public.media_assets(owner_id, created_at desc);
create index media_assets_status_idx on public.media_assets(moderation_status, created_at);

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function private.set_updated_at();

create or replace function private.prepare_media_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.owner_id = (select auth.uid());
  end if;
  new.moderation_status = 'uploading';
  return new;
end;
$$;

revoke all on function private.prepare_media_asset() from public, anon, authenticated;

create trigger media_assets_prepare
before insert on public.media_assets
for each row execute function private.prepare_media_asset();

create table public.observations (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  nickname_snapshot text not null,
  primary_category public.observation_category not null,
  phenomena public.observation_category[] not null,
  intensity smallint not null,
  details text not null default '',
  media_id uuid references public.media_assets(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  position extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
    ) stored,
  location_precision_m integer not null default 150,
  place text not null default '',
  visibility public.content_visibility not null default 'public',
  status public.content_status not null default 'pending',
  verification_status public.observation_verification not null default 'unconfirmed',
  expires_at timestamptz,
  published_at timestamptz,
  like_count integer not null default 0,
  confirmation_count integer not null default 0,
  comment_count integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint observations_nickname_length check (char_length(nickname_snapshot) between 1 and 48),
  constraint observations_phenomena_count check (cardinality(phenomena) between 1 and 5),
  constraint observations_primary_in_phenomena check (primary_category = any(phenomena)),
  constraint observations_intensity check (intensity between 1 and 5),
  constraint observations_details_length check (char_length(details) <= 1000),
  constraint observations_latitude check (latitude between -90 and 90),
  constraint observations_longitude check (longitude between -180 and 180),
  constraint observations_precision check (location_precision_m between 100 and 10000),
  constraint observations_place_length check (char_length(place) <= 160),
  constraint observations_counters check (like_count >= 0 and confirmation_count >= 0 and comment_count >= 0)
);

create index observations_author_idx on public.observations(author_id, created_at desc);
create index observations_public_feed_idx
  on public.observations(status, visibility, created_at desc)
  where deleted_at is null;
create index observations_position_idx on public.observations using gist(position);
create index observations_expires_at_idx on public.observations(expires_at)
  where expires_at is not null and deleted_at is null;
create index observations_phenomena_idx on public.observations using gin(phenomena);

create trigger observations_set_updated_at
before update on public.observations
for each row execute function private.set_updated_at();

create or replace function private.prepare_observation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;
  new.latitude = round(new.latitude::numeric, 3)::double precision;
  new.longitude = round(new.longitude::numeric, 3)::double precision;
  new.location_precision_m = greatest(coalesce(new.location_precision_m, 150), 100);
  new.status = 'pending';
  new.verification_status = 'unconfirmed';
  new.published_at = null;
  new.like_count = 0;
  new.confirmation_count = 0;
  new.comment_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_observation() from public, anon, authenticated;

create trigger observations_prepare
before insert on public.observations
for each row execute function private.prepare_observation();

create table public.observation_confirmations (
  observation_id uuid not null references public.observations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  outcome text not null default 'confirm',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (observation_id, user_id),
  constraint observation_confirmations_outcome check (outcome in ('confirm', 'not_seen', 'unverifiable')),
  constraint observation_confirmations_note_length check (char_length(note) <= 500)
);

create index observation_confirmations_user_idx
  on public.observation_confirmations(user_id, created_at desc);

create trigger observation_confirmations_set_updated_at
before update on public.observation_confirmations
for each row execute function private.set_updated_at();

create table public.observation_likes (
  observation_id uuid not null references public.observations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (observation_id, user_id)
);

create table public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete set null,
  kind public.post_kind not null,
  title text not null,
  body text not null,
  place text not null default '',
  latitude double precision,
  longitude double precision,
  position extensions.geography(point, 4326)
    generated always as (
      case
        when latitude is null or longitude is null then null
        else extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
      end
    ) stored,
  phenomena public.observation_category[] not null default '{}',
  visibility public.content_visibility not null default 'public',
  status public.content_status not null default 'pending',
  useful boolean not null default false,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  share_count integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_title_length check (char_length(title) between 1 and 180),
  constraint posts_body_length check (char_length(body) between 1 and 10000),
  constraint posts_place_length check (char_length(place) <= 160),
  constraint posts_location_pair check ((latitude is null) = (longitude is null)),
  constraint posts_latitude check (latitude is null or latitude between -90 and 90),
  constraint posts_longitude check (longitude is null or longitude between -180 and 180),
  constraint posts_phenomena_count check (cardinality(phenomena) <= 5),
  constraint posts_counters check (like_count >= 0 and comment_count >= 0 and share_count >= 0)
);

create index posts_author_idx on public.posts(author_id, created_at desc);
create index posts_public_feed_idx on public.posts(status, visibility, created_at desc)
  where deleted_at is null;
create index posts_observation_idx on public.posts(observation_id)
  where observation_id is not null;
create index posts_position_idx on public.posts using gist(position);

create trigger posts_set_updated_at
before update on public.posts
for each row execute function private.set_updated_at();

create or replace function private.prepare_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;
  if new.latitude is not null and new.longitude is not null then
    new.latitude = round(new.latitude::numeric, 3)::double precision;
    new.longitude = round(new.longitude::numeric, 3)::double precision;
  end if;
  new.status = 'pending';
  new.published_at = null;
  new.like_count = 0;
  new.comment_count = 0;
  new.share_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_post() from public, anon, authenticated;

create trigger posts_prepare
before insert on public.posts
for each row execute function private.prepare_post();

create table public.post_media (
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete cascade,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (post_id, media_id),
  unique (post_id, display_order),
  constraint post_media_order check (display_order between 0 and 9)
);

create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null,
  reaction_count integer not null default 0,
  status public.content_status not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comments_one_target check (num_nonnulls(post_id, observation_id) = 1),
  constraint comments_body_length check (char_length(body) between 1 and 2000),
  constraint comments_reaction_count check (reaction_count >= 0)
);

create index comments_post_idx on public.comments(post_id, created_at)
  where post_id is not null and deleted_at is null;
create index comments_observation_idx on public.comments(observation_id, created_at)
  where observation_id is not null and deleted_at is null;
create index comments_author_idx on public.comments(author_id, created_at desc);

create trigger comments_set_updated_at
before update on public.comments
for each row execute function private.set_updated_at();

create or replace function private.prepare_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;
  new.status = 'pending';
  new.reaction_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_comment() from public, anon, authenticated;

create trigger comments_prepare
before insert on public.comments
for each row execute function private.prepare_comment();

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_shares (
  id uuid primary key default extensions.gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'copy_link',
  created_at timestamptz not null default now(),
  constraint post_shares_channel_length check (char_length(channel) between 1 and 40)
);

create index post_shares_post_idx on public.post_shares(post_id, created_at desc);
create index post_shares_user_idx on public.post_shares(user_id, created_at desc);

create table public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji),
  constraint comment_reactions_emoji_length check (char_length(emoji) between 1 and 16)
);

create table public.saved_content (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_content_one_target check (num_nonnulls(post_id, observation_id) = 1),
  unique nulls not distinct (user_id, post_id, observation_id)
);

create or replace function private.refresh_observation_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.observation_id, old.observation_id);
  update public.observations
  set
    like_count = (select count(*)::integer from public.observation_likes where observation_id = target_id),
    confirmation_count = (
      select count(*)::integer
      from public.observation_confirmations
      where observation_id = target_id and outcome = 'confirm'
    )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_observation_counters() from public, anon, authenticated;

create trigger observation_likes_refresh_counter
after insert or delete on public.observation_likes
for each row execute function private.refresh_observation_counters();

create trigger observation_confirmations_refresh_counter
after insert or update or delete on public.observation_confirmations
for each row execute function private.refresh_observation_counters();

create or replace function private.refresh_post_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.post_id, old.post_id);
  update public.posts
  set
    like_count = (select count(*)::integer from public.post_likes where post_id = target_id),
    share_count = (select count(*)::integer from public.post_shares where post_id = target_id),
    comment_count = (
      select count(*)::integer
      from public.comments
      where post_id = target_id and deleted_at is null and status = 'published'
    )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_post_counters() from public, anon, authenticated;

create trigger post_likes_refresh_counter
after insert or delete on public.post_likes
for each row execute function private.refresh_post_counters();

create trigger post_shares_refresh_counter
after insert or delete on public.post_shares
for each row execute function private.refresh_post_counters();

create trigger post_comments_refresh_counter
after insert or update or delete on public.comments
for each row
when (coalesce(new.post_id, old.post_id) is not null)
execute function private.refresh_post_counters();

create or replace function private.refresh_observation_comment_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.observation_id, old.observation_id);
  update public.observations
  set comment_count = (
    select count(*)::integer
    from public.comments
    where observation_id = target_id and deleted_at is null and status = 'published'
  )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_observation_comment_counter() from public, anon, authenticated;

create trigger observation_comments_refresh_counter
after insert or update or delete on public.comments
for each row
when (coalesce(new.observation_id, old.observation_id) is not null)
execute function private.refresh_observation_comment_counter();

create or replace function private.refresh_comment_reaction_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.comment_id, old.comment_id);
  update public.comments
  set reaction_count = (
    select count(*)::integer
    from public.comment_reactions
    where comment_id = target_id
  )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_comment_reaction_counter() from public, anon, authenticated;

create trigger comment_reactions_refresh_counter
after insert or delete on public.comment_reactions
for each row execute function private.refresh_comment_reaction_counter();

alter table public.media_assets enable row level security;
alter table public.observations enable row level security;
alter table public.observation_confirmations enable row level security;
alter table public.observation_likes enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_shares enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.saved_content enable row level security;

create policy media_assets_read_public_or_owner
on public.media_assets for select
to anon, authenticated
using (
  (moderation_status = 'approved' and visibility in ('public', 'unlisted'))
  or (select auth.uid()) = owner_id
);

create policy media_assets_insert_owner
on public.media_assets for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy media_assets_update_owner
on public.media_assets for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy media_assets_delete_owner
on public.media_assets for delete
to authenticated
using ((select auth.uid()) = owner_id);

create policy observations_read_public
on public.observations for select
to anon, authenticated
using (
  deleted_at is null
  and status = 'published'
  and visibility in ('public', 'unlisted')
);

create policy observations_read_own
on public.observations for select
to authenticated
using ((select auth.uid()) = author_id);

create policy observations_insert_own
on public.observations for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy observations_update_own
on public.observations for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy observations_delete_own
on public.observations for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy observation_confirmations_read_visible
on public.observation_confirmations for select
to anon, authenticated
using (
  exists (
    select 1 from public.observations
    where observations.id = observation_confirmations.observation_id
  )
);

create policy observation_confirmations_write_own
on public.observation_confirmations for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy observation_confirmations_update_own
on public.observation_confirmations for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy observation_confirmations_delete_own
on public.observation_confirmations for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy observation_likes_read_own
on public.observation_likes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy observation_likes_insert_own
on public.observation_likes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy observation_likes_delete_own
on public.observation_likes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy posts_read_public
on public.posts for select
to anon, authenticated
using (
  deleted_at is null
  and status = 'published'
  and visibility in ('public', 'unlisted')
);

create policy posts_read_own
on public.posts for select
to authenticated
using ((select auth.uid()) = author_id);

create policy posts_insert_own
on public.posts for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy posts_update_own
on public.posts for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy posts_delete_own
on public.posts for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy post_media_read_visible
on public.post_media for select
to anon, authenticated
using (exists (select 1 from public.posts where posts.id = post_media.post_id));

create policy post_media_write_owned_post
on public.post_media for insert
to authenticated
with check (
  exists (
    select 1 from public.posts
    where posts.id = post_media.post_id and posts.author_id = (select auth.uid())
  )
);

create policy post_media_delete_owned_post
on public.post_media for delete
to authenticated
using (
  exists (
    select 1 from public.posts
    where posts.id = post_media.post_id and posts.author_id = (select auth.uid())
  )
);

create policy comments_read_visible
on public.comments for select
to anon, authenticated
using (
  deleted_at is null
  and status = 'published'
  and (
    (post_id is not null and exists (select 1 from public.posts where posts.id = comments.post_id))
    or
    (observation_id is not null and exists (
      select 1 from public.observations where observations.id = comments.observation_id
    ))
  )
);

create policy comments_read_own
on public.comments for select
to authenticated
using ((select auth.uid()) = author_id);

create policy comments_insert_own
on public.comments for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and (
    (post_id is not null and exists (select 1 from public.posts where posts.id = comments.post_id))
    or
    (observation_id is not null and exists (
      select 1 from public.observations where observations.id = comments.observation_id
    ))
  )
);

create policy comments_update_own
on public.comments for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy comments_delete_own
on public.comments for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy post_likes_read_own
on public.post_likes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy post_likes_insert_own
on public.post_likes for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy post_likes_delete_own
on public.post_likes for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy post_shares_read_own
on public.post_shares for select
to authenticated
using ((select auth.uid()) = user_id);

create policy post_shares_insert_own
on public.post_shares for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy comment_reactions_read_visible
on public.comment_reactions for select
to anon, authenticated
using (exists (select 1 from public.comments where comments.id = comment_reactions.comment_id));

create policy comment_reactions_insert_own
on public.comment_reactions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy comment_reactions_delete_own
on public.comment_reactions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy saved_content_self
on public.saved_content for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.media_assets from anon, authenticated;
revoke all on public.observations from anon, authenticated;
revoke all on public.observation_confirmations from anon, authenticated;
revoke all on public.observation_likes from anon, authenticated;
revoke all on public.posts from anon, authenticated;
revoke all on public.post_media from anon, authenticated;
revoke all on public.comments from anon, authenticated;
revoke all on public.post_likes from anon, authenticated;
revoke all on public.post_shares from anon, authenticated;
revoke all on public.comment_reactions from anon, authenticated;
revoke all on public.saved_content from anon, authenticated;

grant select on public.media_assets to anon, authenticated;
grant insert (owner_id, bucket_id, object_path, kind, visibility, mime_type, byte_size, width, height, duration_seconds, alt_text, rights_confirmed, metadata)
  on public.media_assets to authenticated;
grant update (object_path, visibility, alt_text, rights_confirmed, metadata)
  on public.media_assets to authenticated;
grant delete on public.media_assets to authenticated;

grant select on public.observations to anon, authenticated;
grant insert (author_id, nickname_snapshot, primary_category, phenomena, intensity, details, media_id, latitude, longitude, location_precision_m, place, visibility, expires_at, is_demo)
  on public.observations to authenticated;
grant update (nickname_snapshot, primary_category, phenomena, intensity, details, media_id, latitude, longitude, location_precision_m, place, visibility, expires_at, deleted_at)
  on public.observations to authenticated;
grant delete on public.observations to authenticated;

grant select on public.observation_confirmations to anon, authenticated;
grant insert, update, delete on public.observation_confirmations to authenticated;
grant select, insert, delete on public.observation_likes to authenticated;

grant select on public.posts to anon, authenticated;
grant insert (author_id, observation_id, kind, title, body, place, latitude, longitude, phenomena, visibility)
  on public.posts to authenticated;
grant update (observation_id, kind, title, body, place, latitude, longitude, phenomena, visibility, deleted_at)
  on public.posts to authenticated;
grant delete on public.posts to authenticated;

grant select on public.post_media to anon, authenticated;
grant insert, delete on public.post_media to authenticated;
grant select on public.comments to anon, authenticated;
grant insert (author_id, post_id, observation_id, parent_id, body) on public.comments to authenticated;
grant update (body, deleted_at) on public.comments to authenticated;
grant delete on public.comments to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_shares to authenticated;
grant select on public.comment_reactions to anon, authenticated;
grant insert, delete on public.comment_reactions to authenticated;
grant select, insert, delete on public.saved_content to authenticated;

commit;
