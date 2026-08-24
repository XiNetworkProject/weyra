begin;

grant usage on schema private to anon, authenticated;

create table public.communities (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  slug extensions.citext not null unique,
  name text not null,
  initials text not null,
  description text not null,
  about text not null default '',
  territory text not null,
  themes text[] not null default '{}',
  access public.community_access not null default 'public',
  template public.community_template not null default 'local',
  status public.content_status not null default 'pending',
  member_count integer not null default 0,
  active_count integer not null default 0,
  observation_count integer not null default 0,
  verified boolean not null default false,
  banner_media_id uuid references public.media_assets(id) on delete set null,
  accent text not null default '#55c2ff',
  center_latitude double precision not null,
  center_longitude double precision not null,
  center_position extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(
        extensions.st_makepoint(center_longitude, center_latitude),
        4326
      )::extensions.geography
    ) stored,
  rules text[] not null default '{}',
  featured_space_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint communities_slug_length check (char_length(slug::text) between 3 and 64),
  constraint communities_slug_format check (slug::text ~ '^[a-z0-9-]+$'),
  constraint communities_name_length check (char_length(name) between 3 and 100),
  constraint communities_initials_length check (char_length(initials) between 1 and 4),
  constraint communities_description_length check (char_length(description) between 10 and 500),
  constraint communities_about_length check (char_length(about) <= 4000),
  constraint communities_territory_length check (char_length(territory) between 2 and 160),
  constraint communities_themes_count check (cardinality(themes) <= 12),
  constraint communities_counters check (member_count >= 0 and active_count >= 0 and observation_count >= 0),
  constraint communities_accent_format check (accent ~ '^#[0-9a-fA-F]{6}$'),
  constraint communities_center_latitude check (center_latitude between -90 and 90),
  constraint communities_center_longitude check (center_longitude between -180 and 180),
  constraint communities_rules_count check (cardinality(rules) <= 20),
  constraint communities_featured_count check (cardinality(featured_space_ids) <= 6)
);

create index communities_public_idx on public.communities(status, access, created_at desc)
  where deleted_at is null;
create index communities_owner_idx on public.communities(owner_id, created_at desc);
create index communities_center_idx on public.communities using gist(center_position);
create index communities_themes_idx on public.communities using gin(themes);

create trigger communities_set_updated_at
before update on public.communities
for each row execute function private.set_updated_at();

create or replace function private.prepare_community()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.owner_id = (select auth.uid());
  end if;
  new.center_latitude = round(new.center_latitude::numeric, 3)::double precision;
  new.center_longitude = round(new.center_longitude::numeric, 3)::double precision;
  new.status = 'pending';
  new.verified = false;
  new.member_count = 0;
  new.active_count = 0;
  new.observation_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_community() from public, anon, authenticated;

create trigger communities_prepare
before insert on public.communities
for each row execute function private.prepare_community();

create table public.community_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  display_order smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, name),
  unique (community_id, display_order),
  constraint community_sections_name_length check (char_length(name) between 1 and 80),
  constraint community_sections_order check (display_order between 0 and 100)
);

create trigger community_sections_set_updated_at
before update on public.community_sections
for each row execute function private.set_updated_at();

create table public.community_roles (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null,
  summary text not null default '',
  color text not null default '#89a2b8',
  priority smallint not null default 0,
  critical boolean not null default false,
  system_key text,
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, name),
  unique nulls not distinct (community_id, system_key),
  constraint community_roles_name_length check (char_length(name) between 1 and 80),
  constraint community_roles_summary_length check (char_length(summary) <= 500),
  constraint community_roles_color_format check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint community_roles_priority check (priority between 0 and 1000),
  constraint community_roles_system_key check (
    system_key is null or system_key in ('owner', 'admin', 'moderator', 'verified_observer', 'member')
  ),
  constraint community_roles_permissions_count check (cardinality(permissions) <= 80)
);

create index community_roles_community_idx on public.community_roles(community_id, priority desc);

create trigger community_roles_set_updated_at
before update on public.community_roles
for each row execute function private.set_updated_at();

create table public.community_members (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.community_roles(id) on delete restrict,
  status public.membership_status not null default 'pending',
  joined_at timestamptz,
  last_active_at timestamptz,
  contribution_count integer not null default 0,
  internal_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, user_id),
  constraint community_members_contributions check (contribution_count >= 0),
  constraint community_members_internal_note_length check (char_length(internal_note) <= 2000)
);

create index community_members_user_idx on public.community_members(user_id, status, updated_at desc);
create index community_members_community_idx on public.community_members(community_id, status, last_active_at desc);
create index community_members_role_idx on public.community_members(role_id);

create trigger community_members_set_updated_at
before update on public.community_members
for each row execute function private.set_updated_at();

create or replace function private.bootstrap_community()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role_id uuid;
begin
  insert into public.community_sections (community_id, name, display_order)
  values
    (new.id, 'Essentiel', 10),
    (new.id, 'Terrain', 20),
    (new.id, 'Vie locale', 30);

  insert into public.community_roles (
    community_id,
    name,
    summary,
    color,
    priority,
    critical,
    system_key,
    permissions
  )
  values
    (
      new.id,
      'Proprietaire',
      'Responsabilite globale et securite de la communaute.',
      '#ff7388',
      1000,
      true,
      'owner',
      array[
        'manage_community',
        'manage_spaces',
        'manage_members',
        'manage_roles',
        'moderate_content',
        'publish_announcements',
        'manage_events',
        'view_audit_log'
      ]
    ),
    (
      new.id,
      'Administrateur',
      'Structure, membres et fonctionnement quotidien.',
      '#9b8cff',
      800,
      true,
      'admin',
      array[
        'manage_spaces',
        'manage_members',
        'moderate_content',
        'publish_announcements',
        'manage_events'
      ]
    ),
    (
      new.id,
      'Moderateur',
      'Qualite des echanges et traitement des signalements.',
      '#55c2ff',
      600,
      false,
      'moderator',
      array['moderate_content', 'manage_members_limited']
    ),
    (
      new.id,
      'Observateur verifie',
      'Observations regulieres et contexte fiable.',
      '#58d5a5',
      300,
      false,
      'verified_observer',
      array['publish_observation', 'confirm_observation']
    ),
    (
      new.id,
      'Membre',
      'Participation ordinaire aux espaces autorises.',
      '#89a2b8',
      100,
      false,
      'member',
      array['publish_message', 'publish_observation', 'confirm_observation']
    );

  select id into owner_role_id
  from public.community_roles
  where community_id = new.id and system_key = 'owner';

  insert into public.community_members (
    community_id,
    user_id,
    role_id,
    status,
    joined_at,
    last_active_at
  )
  values (
    new.id,
    new.owner_id,
    owner_role_id,
    'joined',
    now(),
    now()
  );

  return new;
end;
$$;

revoke all on function private.bootstrap_community() from public, anon, authenticated;

create trigger communities_bootstrap
after insert on public.communities
for each row execute function private.bootstrap_community();

create or replace function private.is_community_member(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_members
    where community_id = target_community_id
      and user_id = (select auth.uid())
      and status = 'joined'
  );
$$;

create or replace function private.can_manage_community(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.communities
      where id = target_community_id
        and owner_id = (select auth.uid())
        and deleted_at is null
    )
    or exists (
      select 1
      from public.community_members members
      join public.community_roles roles on roles.id = members.role_id
      where members.community_id = target_community_id
        and members.user_id = (select auth.uid())
        and members.status = 'joined'
        and roles.permissions && array[
          'manage_community',
          'manage_spaces',
          'manage_members',
          'manage_roles'
        ]
    );
$$;

create or replace function private.can_moderate_community(target_community_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_manage_community(target_community_id)
    or exists (
      select 1
      from public.community_members members
      join public.community_roles roles on roles.id = members.role_id
      where members.community_id = target_community_id
        and members.user_id = (select auth.uid())
        and members.status = 'joined'
        and 'moderate_content' = any(roles.permissions)
    );
$$;

revoke all on function private.is_community_member(uuid) from public;
revoke all on function private.can_manage_community(uuid) from public;
revoke all on function private.can_moderate_community(uuid) from public;
grant execute on function private.is_community_member(uuid) to anon, authenticated;
grant execute on function private.can_manage_community(uuid) to authenticated;
grant execute on function private.can_moderate_community(uuid) to authenticated;

create or replace function private.prepare_community_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  community_access public.community_access;
  community_owner uuid;
  resolved_role_id uuid;
begin
  if (select auth.uid()) is not null then
    new.user_id = (select auth.uid());
  end if;

  select access, owner_id
  into community_access, community_owner
  from public.communities
  where id = new.community_id;

  if new.user_id = community_owner then
    select id into resolved_role_id
    from public.community_roles
    where community_id = new.community_id and system_key = 'owner';
    new.status = 'joined';
    new.joined_at = coalesce(new.joined_at, now());
  else
    select id into resolved_role_id
    from public.community_roles
    where community_id = new.community_id and system_key = 'member';
    new.status = case when community_access = 'public' then 'joined' else 'pending' end;
    new.joined_at = case when community_access = 'public' then now() else null end;
  end if;

  new.role_id = resolved_role_id;
  new.internal_note = '';
  return new;
end;
$$;

revoke all on function private.prepare_community_membership() from public, anon, authenticated;

create trigger community_members_prepare
before insert on public.community_members
for each row execute function private.prepare_community_membership();

create table public.community_spaces (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  section_id uuid not null references public.community_sections(id) on delete cascade,
  name text not null,
  description text not null default '',
  type public.community_space_type not null,
  visibility public.space_visibility not null default 'members',
  display_order smallint not null default 0,
  live boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, name),
  unique (section_id, display_order),
  constraint community_spaces_name_length check (char_length(name) between 1 and 100),
  constraint community_spaces_description_length check (char_length(description) <= 500),
  constraint community_spaces_order check (display_order between 0 and 100)
);

create index community_spaces_community_idx
  on public.community_spaces(community_id, archived_at, display_order);

create trigger community_spaces_set_updated_at
before update on public.community_spaces
for each row execute function private.set_updated_at();

create table public.community_notification_preferences (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode public.notification_mode not null default 'essential',
  muted_space_ids uuid[] not null default '{}',
  custom_rules jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id),
  constraint community_notification_rules_object check (jsonb_typeof(custom_rules) = 'object')
);

create table public.favorite_communities (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table public.followed_spaces (
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table public.community_events (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  summary text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  place text not null default '',
  access public.event_access not null default 'members',
  format public.event_format not null default 'onsite',
  media_id uuid references public.media_assets(id) on delete set null,
  latitude double precision,
  longitude double precision,
  position extensions.geography(point, 4326)
    generated always as (
      case
        when latitude is null or longitude is null then null
        else extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
      end
    ) stored,
  participant_count integer not null default 0,
  interested_count integer not null default 0,
  status public.content_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_events_title_length check (char_length(title) between 3 and 160),
  constraint community_events_summary_length check (char_length(summary) between 1 and 4000),
  constraint community_events_time_order check (ends_at > starts_at),
  constraint community_events_place_length check (char_length(place) <= 200),
  constraint community_events_location_pair check ((latitude is null) = (longitude is null)),
  constraint community_events_latitude check (latitude is null or latitude between -90 and 90),
  constraint community_events_longitude check (longitude is null or longitude between -180 and 180),
  constraint community_events_counters check (participant_count >= 0 and interested_count >= 0)
);

create index community_events_community_idx
  on public.community_events(community_id, starts_at)
  where deleted_at is null;
create index community_events_position_idx on public.community_events using gist(position);

create trigger community_events_set_updated_at
before update on public.community_events
for each row execute function private.set_updated_at();

create or replace function private.prepare_community_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.creator_id = (select auth.uid());
  end if;
  if new.latitude is not null and new.longitude is not null then
    new.latitude = round(new.latitude::numeric, 3)::double precision;
    new.longitude = round(new.longitude::numeric, 3)::double precision;
  end if;
  new.status = 'pending';
  new.participant_count = 0;
  new.interested_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_community_event() from public, anon, authenticated;

create trigger community_events_prepare
before insert on public.community_events
for each row execute function private.prepare_community_event();

create table public.event_attendees (
  event_id uuid not null references public.community_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'interested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint event_attendees_response check (response in ('going', 'interested', 'declined'))
);

create trigger event_attendees_set_updated_at
before update on public.event_attendees
for each row execute function private.set_updated_at();

create table public.community_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  reply_to_id uuid references public.community_messages(id) on delete set null,
  kind public.message_kind not null default 'message',
  body text not null,
  reaction_count integer not null default 0,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_messages_body_length check (char_length(body) between 1 and 5000),
  constraint community_messages_reaction_count check (reaction_count >= 0)
);

create index community_messages_space_idx
  on public.community_messages(space_id, created_at desc)
  where deleted_at is null;
create index community_messages_author_idx
  on public.community_messages(author_id, created_at desc);

create trigger community_messages_set_updated_at
before update on public.community_messages
for each row execute function private.set_updated_at();

create or replace function private.prepare_community_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;
  new.reaction_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_community_message() from public, anon, authenticated;

create trigger community_messages_prepare
before insert on public.community_messages
for each row execute function private.prepare_community_message();

create table public.community_message_reactions (
  message_id uuid not null references public.community_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint community_message_reactions_emoji_length check (char_length(emoji) between 1 and 16)
);

create table public.threads (
  id uuid primary key default extensions.gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  space_id uuid not null references public.community_spaces(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  source_message_id uuid references public.community_messages(id) on delete set null,
  source_post_id uuid references public.posts(id) on delete set null,
  source_observation_id uuid references public.observations(id) on delete set null,
  source_event_id uuid references public.community_events(id) on delete set null,
  title text not null,
  resolved_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint threads_source_count check (
    num_nonnulls(source_message_id, source_post_id, source_observation_id, source_event_id) <= 1
  ),
  constraint threads_title_length check (char_length(title) between 1 and 180)
);

create index threads_space_idx on public.threads(space_id, last_activity_at desc)
  where deleted_at is null;

create trigger threads_set_updated_at
before update on public.threads
for each row execute function private.set_updated_at();

create table public.thread_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint thread_messages_body_length check (char_length(body) between 1 and 5000)
);

create index thread_messages_thread_idx
  on public.thread_messages(thread_id, created_at)
  where deleted_at is null;

create trigger thread_messages_set_updated_at
before update on public.thread_messages
for each row execute function private.set_updated_at();

alter table public.observations
  add column community_id uuid references public.communities(id) on delete set null,
  add column space_id uuid references public.community_spaces(id) on delete set null,
  add constraint observations_space_requires_community check (space_id is null or community_id is not null);

alter table public.posts
  add column community_id uuid references public.communities(id) on delete set null,
  add column space_id uuid references public.community_spaces(id) on delete set null,
  add constraint posts_space_requires_community check (space_id is null or community_id is not null);

create index observations_community_idx
  on public.observations(community_id, created_at desc)
  where community_id is not null and deleted_at is null;
create index posts_community_idx
  on public.posts(community_id, created_at desc)
  where community_id is not null and deleted_at is null;

drop policy observations_insert_own on public.observations;
create policy observations_insert_own
on public.observations for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and (
    community_id is null
    or private.is_community_member(community_id)
  )
  and (
    space_id is null
    or exists (
      select 1
      from public.community_spaces
      where community_spaces.id = observations.space_id
        and community_spaces.community_id = observations.community_id
    )
  )
);

create policy observations_read_community
on public.observations for select
to authenticated
using (
  deleted_at is null
  and visibility = 'community'
  and community_id is not null
  and private.is_community_member(community_id)
);

drop policy observations_update_own on public.observations;
create policy observations_update_own
on public.observations for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check (
  (select auth.uid()) = author_id
  and (
    community_id is null
    or private.is_community_member(community_id)
  )
);

drop policy posts_insert_own on public.posts;
create policy posts_insert_own
on public.posts for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and (
    community_id is null
    or private.is_community_member(community_id)
  )
  and (
    space_id is null
    or exists (
      select 1
      from public.community_spaces
      where community_spaces.id = posts.space_id
        and community_spaces.community_id = posts.community_id
    )
  )
);

create policy posts_read_community
on public.posts for select
to authenticated
using (
  deleted_at is null
  and visibility = 'community'
  and community_id is not null
  and private.is_community_member(community_id)
);

drop policy posts_update_own on public.posts;
create policy posts_update_own
on public.posts for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check (
  (select auth.uid()) = author_id
  and (
    community_id is null
    or private.is_community_member(community_id)
  )
);

create or replace function private.refresh_community_member_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.community_id, old.community_id);
  update public.communities
  set
    member_count = (
      select count(*)::integer
      from public.community_members
      where community_id = target_id and status = 'joined'
    ),
    active_count = (
      select count(*)::integer
      from public.community_members
      where community_id = target_id
        and status = 'joined'
        and last_active_at >= now() - interval '7 days'
    )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_community_member_count() from public, anon, authenticated;

create trigger community_members_refresh_counter
after insert or update or delete on public.community_members
for each row execute function private.refresh_community_member_count();

create or replace function private.refresh_community_observation_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.community_id, old.community_id);
  if target_id is not null then
    update public.communities
    set observation_count = (
      select count(*)::integer
      from public.observations
      where community_id = target_id
        and deleted_at is null
        and status in ('pending', 'published', 'limited')
    )
    where id = target_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_community_observation_count() from public, anon, authenticated;

create trigger observations_refresh_community_counter
after insert or update or delete on public.observations
for each row execute function private.refresh_community_observation_count();

create or replace function private.refresh_event_counts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.event_id, old.event_id);
  update public.community_events
  set
    participant_count = (
      select count(*)::integer from public.event_attendees
      where event_id = target_id and response = 'going'
    ),
    interested_count = (
      select count(*)::integer from public.event_attendees
      where event_id = target_id and response = 'interested'
    )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_event_counts() from public, anon, authenticated;

create trigger event_attendees_refresh_counter
after insert or update or delete on public.event_attendees
for each row execute function private.refresh_event_counts();

create or replace function private.refresh_community_message_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.message_id, old.message_id);
  update public.community_messages
  set reaction_count = (
    select count(*)::integer
    from public.community_message_reactions
    where message_id = target_id
  )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_community_message_reactions() from public, anon, authenticated;

create trigger community_message_reactions_refresh_counter
after insert or delete on public.community_message_reactions
for each row execute function private.refresh_community_message_reactions();

alter table public.communities enable row level security;
alter table public.community_sections enable row level security;
alter table public.community_roles enable row level security;
alter table public.community_members enable row level security;
alter table public.community_spaces enable row level security;
alter table public.community_notification_preferences enable row level security;
alter table public.favorite_communities enable row level security;
alter table public.followed_spaces enable row level security;
alter table public.community_events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_message_reactions enable row level security;
alter table public.threads enable row level security;
alter table public.thread_messages enable row level security;

create policy communities_public_read
on public.communities for select
to anon, authenticated
using (
  deleted_at is null
  and status = 'published'
  and access in ('public', 'request')
);

create policy communities_owner_read
on public.communities for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy communities_member_read
on public.communities for select
to authenticated
using (private.is_community_member(id));

create policy communities_insert_owner
on public.communities for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy communities_update_manager
on public.communities for update
to authenticated
using (private.can_manage_community(id))
with check (private.can_manage_community(id));

create policy community_sections_public_read
on public.community_sections for select
to anon, authenticated
using (
  archived_at is null
  and exists (
    select 1 from public.communities
    where communities.id = community_sections.community_id
  )
);

create policy community_sections_manage
on public.community_sections for all
to authenticated
using (private.can_manage_community(community_id))
with check (private.can_manage_community(community_id));

create policy community_roles_read
on public.community_roles for select
to anon, authenticated
using (
  exists (
    select 1 from public.communities
    where communities.id = community_roles.community_id
  )
);

create policy community_roles_manage
on public.community_roles for all
to authenticated
using (private.can_manage_community(community_id))
with check (private.can_manage_community(community_id));

create policy community_members_read_self_or_peers
on public.community_members for select
to authenticated
using (
  (select auth.uid()) = user_id
  or private.is_community_member(community_id)
);

create policy community_members_request_self
on public.community_members for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy community_members_manage
on public.community_members for update
to authenticated
using (private.can_manage_community(community_id))
with check (private.can_manage_community(community_id));

create policy community_members_leave_self
on public.community_members for delete
to authenticated
using (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.communities
    where communities.id = community_members.community_id
      and communities.owner_id = community_members.user_id
  )
);

create policy community_members_remove_manager
on public.community_members for delete
to authenticated
using (private.can_manage_community(community_id));

create policy community_spaces_read
on public.community_spaces for select
to anon, authenticated
using (
  archived_at is null
  and (
    visibility = 'public'
    or private.is_community_member(community_id)
  )
  and exists (
    select 1 from public.communities
    where communities.id = community_spaces.community_id
  )
);

create policy community_spaces_manage
on public.community_spaces for all
to authenticated
using (private.can_manage_community(community_id))
with check (private.can_manage_community(community_id));

create policy community_notification_preferences_self
on public.community_notification_preferences for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and private.is_community_member(community_id)
);

create policy favorite_communities_self
on public.favorite_communities for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy followed_spaces_self
on public.followed_spaces for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.community_spaces where community_spaces.id = followed_spaces.space_id)
);

create policy community_events_read
on public.community_events for select
to anon, authenticated
using (
  deleted_at is null
  and status = 'published'
  and (
    access = 'public'
    or private.is_community_member(community_id)
  )
  and exists (select 1 from public.communities where communities.id = community_events.community_id)
);

create policy community_events_read_creator
on public.community_events for select
to authenticated
using ((select auth.uid()) = creator_id);

create policy community_events_insert
on public.community_events for insert
to authenticated
with check (
  (select auth.uid()) = creator_id
  and private.is_community_member(community_id)
);

create policy community_events_manage
on public.community_events for update
to authenticated
using (
  (select auth.uid()) = creator_id
  or private.can_manage_community(community_id)
)
with check (
  (select auth.uid()) = creator_id
  or private.can_manage_community(community_id)
);

create policy event_attendees_read
on public.event_attendees for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1 from public.community_events
    where community_events.id = event_attendees.event_id
  )
);

create policy event_attendees_self
on public.event_attendees for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy community_messages_read
on public.community_messages for select
to anon, authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.community_spaces
    where community_spaces.id = community_messages.space_id
      and community_spaces.community_id = community_messages.community_id
  )
);

create policy community_messages_insert
on public.community_messages for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and private.is_community_member(community_id)
  and exists (
    select 1 from public.community_spaces
    where community_spaces.id = community_messages.space_id
      and community_spaces.community_id = community_messages.community_id
      and community_spaces.archived_at is null
  )
);

create policy community_messages_update_own
on public.community_messages for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy community_messages_delete_own_or_moderator
on public.community_messages for delete
to authenticated
using (
  (select auth.uid()) = author_id
  or private.can_moderate_community(community_id)
);

create policy community_message_reactions_read
on public.community_message_reactions for select
to anon, authenticated
using (
  exists (
    select 1 from public.community_messages
    where community_messages.id = community_message_reactions.message_id
  )
);

create policy community_message_reactions_insert
on public.community_message_reactions for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy community_message_reactions_delete
on public.community_message_reactions for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy threads_read
on public.threads for select
to anon, authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.community_spaces
    where community_spaces.id = threads.space_id
      and community_spaces.community_id = threads.community_id
  )
);

create policy threads_insert
on public.threads for insert
to authenticated
with check (
  (select auth.uid()) = creator_id
  and private.is_community_member(community_id)
);

create policy threads_update_creator_or_moderator
on public.threads for update
to authenticated
using (
  (select auth.uid()) = creator_id
  or private.can_moderate_community(community_id)
)
with check (
  (select auth.uid()) = creator_id
  or private.can_moderate_community(community_id)
);

create policy thread_messages_read
on public.thread_messages for select
to anon, authenticated
using (
  deleted_at is null
  and exists (select 1 from public.threads where threads.id = thread_messages.thread_id)
);

create policy thread_messages_insert
on public.thread_messages for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and exists (
    select 1
    from public.threads
    where threads.id = thread_messages.thread_id
      and private.is_community_member(threads.community_id)
  )
);

create policy thread_messages_update_own
on public.thread_messages for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy thread_messages_delete_own
on public.thread_messages for delete
to authenticated
using ((select auth.uid()) = author_id);

revoke all on public.communities from anon, authenticated;
revoke all on public.community_sections from anon, authenticated;
revoke all on public.community_roles from anon, authenticated;
revoke all on public.community_members from anon, authenticated;
revoke all on public.community_spaces from anon, authenticated;
revoke all on public.community_notification_preferences from anon, authenticated;
revoke all on public.favorite_communities from anon, authenticated;
revoke all on public.followed_spaces from anon, authenticated;
revoke all on public.community_events from anon, authenticated;
revoke all on public.event_attendees from anon, authenticated;
revoke all on public.community_messages from anon, authenticated;
revoke all on public.community_message_reactions from anon, authenticated;
revoke all on public.threads from anon, authenticated;
revoke all on public.thread_messages from anon, authenticated;

grant select on public.communities to anon, authenticated;
grant insert (owner_id, slug, name, initials, description, about, territory, themes, access, template, banner_media_id, accent, center_latitude, center_longitude, rules)
  on public.communities to authenticated;
grant update (slug, name, initials, description, about, territory, themes, access, template, banner_media_id, accent, center_latitude, center_longitude, rules, featured_space_ids, deleted_at)
  on public.communities to authenticated;

grant select on public.community_sections to anon, authenticated;
grant insert, update, delete on public.community_sections to authenticated;
grant select on public.community_roles to anon, authenticated;
grant insert, update, delete on public.community_roles to authenticated;
grant select, insert, update, delete on public.community_members to authenticated;
grant select on public.community_spaces to anon, authenticated;
grant insert, update, delete on public.community_spaces to authenticated;
grant select, insert, update, delete on public.community_notification_preferences to authenticated;
grant select, insert, delete on public.favorite_communities to authenticated;
grant select, insert, delete on public.followed_spaces to authenticated;

grant select on public.community_events to anon, authenticated;
grant insert (community_id, creator_id, title, summary, starts_at, ends_at, place, access, format, media_id, latitude, longitude)
  on public.community_events to authenticated;
grant update (title, summary, starts_at, ends_at, place, access, format, media_id, latitude, longitude, deleted_at)
  on public.community_events to authenticated;
grant delete on public.community_events to authenticated;
grant select, insert, update, delete on public.event_attendees to authenticated;

grant select on public.community_messages to anon, authenticated;
grant insert (community_id, space_id, author_id, reply_to_id, kind, body)
  on public.community_messages to authenticated;
grant update (body, edited_at, deleted_at) on public.community_messages to authenticated;
grant delete on public.community_messages to authenticated;
grant select on public.community_message_reactions to anon, authenticated;
grant insert, delete on public.community_message_reactions to authenticated;

grant select on public.threads to anon, authenticated;
grant insert (community_id, space_id, creator_id, source_message_id, source_post_id, source_observation_id, source_event_id, title)
  on public.threads to authenticated;
grant update (title, resolved_at, last_activity_at, deleted_at) on public.threads to authenticated;
grant delete on public.threads to authenticated;
grant select on public.thread_messages to anon, authenticated;
grant insert (thread_id, author_id, body) on public.thread_messages to authenticated;
grant update (body, deleted_at) on public.thread_messages to authenticated;
grant delete on public.thread_messages to authenticated;

grant insert (author_id, nickname_snapshot, primary_category, phenomena, intensity, details, media_id, latitude, longitude, location_precision_m, place, visibility, expires_at, is_demo, community_id, space_id)
  on public.observations to authenticated;
grant update (nickname_snapshot, primary_category, phenomena, intensity, details, media_id, latitude, longitude, location_precision_m, place, visibility, expires_at, deleted_at, community_id, space_id)
  on public.observations to authenticated;
grant insert (author_id, observation_id, kind, title, body, place, latitude, longitude, phenomena, visibility, community_id, space_id)
  on public.posts to authenticated;
grant update (observation_id, kind, title, body, place, latitude, longitude, phenomena, visibility, deleted_at, community_id, space_id)
  on public.posts to authenticated;

commit;
