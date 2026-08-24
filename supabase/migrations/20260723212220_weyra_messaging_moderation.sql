begin;

create table public.storm_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  community_id uuid references public.communities(id) on delete set null,
  title text not null,
  short_title text not null,
  summary text not null,
  area text not null,
  phenomenon public.observation_category not null,
  status public.room_status not null default 'watching',
  visibility public.content_visibility not null default 'public',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  last_activity_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  position extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
    ) stored,
  media_id uuid references public.media_assets(id) on delete set null,
  participant_count integer not null default 0,
  observation_count integer not null default 0,
  message_count integer not null default 0,
  source_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint storm_rooms_title_length check (char_length(title) between 3 and 160),
  constraint storm_rooms_short_title_length check (char_length(short_title) between 1 and 80),
  constraint storm_rooms_summary_length check (char_length(summary) between 1 and 2000),
  constraint storm_rooms_area_length check (char_length(area) between 1 and 160),
  constraint storm_rooms_time_order check (ends_at is null or ends_at > starts_at),
  constraint storm_rooms_latitude check (latitude between -90 and 90),
  constraint storm_rooms_longitude check (longitude between -180 and 180),
  constraint storm_rooms_counters check (
    participant_count >= 0
    and observation_count >= 0
    and message_count >= 0
    and source_count >= 0
  )
);

create index storm_rooms_activity_idx on public.storm_rooms(status, last_activity_at desc)
  where archived_at is null;
create index storm_rooms_community_idx on public.storm_rooms(community_id, last_activity_at desc)
  where community_id is not null;
create index storm_rooms_position_idx on public.storm_rooms using gist(position);

create trigger storm_rooms_set_updated_at
before update on public.storm_rooms
for each row execute function private.set_updated_at();

create or replace function private.prepare_storm_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.creator_id = (select auth.uid());
  end if;
  new.latitude = round(new.latitude::numeric, 3)::double precision;
  new.longitude = round(new.longitude::numeric, 3)::double precision;
  new.participant_count = 0;
  new.observation_count = 0;
  new.message_count = 0;
  new.source_count = 0;
  return new;
end;
$$;

revoke all on function private.prepare_storm_room() from public, anon, authenticated;

create trigger storm_rooms_prepare
before insert on public.storm_rooms
for each row execute function private.prepare_storm_room();

create table public.room_members (
  room_id uuid not null references public.storm_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  left_at timestamptz,
  primary key (room_id, user_id),
  constraint room_members_role check (role in ('host', 'moderator', 'participant', 'observer'))
);

create index room_members_user_idx on public.room_members(user_id, joined_at desc);

create or replace function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = target_room_id
      and user_id = (select auth.uid())
      and left_at is null
  );
$$;

revoke all on function private.is_room_member(uuid) from public;
grant execute on function private.is_room_member(uuid) to anon, authenticated;

create or replace function private.bootstrap_storm_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_members (room_id, user_id, role)
  values (new.id, new.creator_id, 'host');
  return new;
end;
$$;

revoke all on function private.bootstrap_storm_room() from public, anon, authenticated;

create trigger storm_rooms_bootstrap
after insert on public.storm_rooms
for each row execute function private.bootstrap_storm_room();

create table public.room_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  room_id uuid not null references public.storm_rooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind public.message_kind not null default 'message',
  body text not null,
  media_id uuid references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint room_messages_body_length check (char_length(body) between 1 and 4000)
);

create index room_messages_room_idx on public.room_messages(room_id, created_at desc)
  where deleted_at is null;

create trigger room_messages_set_updated_at
before update on public.room_messages
for each row execute function private.set_updated_at();

create or replace function private.prepare_room_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_room_message() from public, anon, authenticated;

create trigger room_messages_prepare
before insert on public.room_messages
for each row execute function private.prepare_room_message();

create table public.room_observations (
  room_id uuid not null references public.storm_rooms(id) on delete cascade,
  observation_id uuid not null references public.observations(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, observation_id)
);

create table public.conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null default '',
  kind text not null default 'direct',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint conversations_title_length check (char_length(title) <= 120),
  constraint conversations_kind check (kind in ('direct', 'group'))
);

create index conversations_activity_idx on public.conversations(last_message_at desc)
  where archived_at is null;

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function private.set_updated_at();

create or replace function private.prepare_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by = (select auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_conversation() from public, anon, authenticated;

create trigger conversations_prepare
before insert on public.conversations
for each row execute function private.prepare_conversation();

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested',
  joined_at timestamptz,
  last_read_at timestamptz,
  muted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_participants_status check (status in ('requested', 'active', 'declined', 'left', 'blocked'))
);

create index conversation_participants_user_idx
  on public.conversation_participants(user_id, status, updated_at desc);

create trigger conversation_participants_set_updated_at
before update on public.conversation_participants
for each row execute function private.set_updated_at();

create or replace function private.is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = target_conversation_id
      and user_id = (select auth.uid())
      and status in ('requested', 'active')
  );
$$;

create or replace function private.is_active_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = target_conversation_id
      and user_id = (select auth.uid())
      and status = 'active'
  );
$$;

revoke all on function private.is_conversation_participant(uuid) from public;
revoke all on function private.is_active_conversation_participant(uuid) from public;
grant execute on function private.is_conversation_participant(uuid) to authenticated;
grant execute on function private.is_active_conversation_participant(uuid) to authenticated;

create or replace function private.bootstrap_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_participants (
    conversation_id,
    user_id,
    status,
    joined_at
  )
  values (
    new.id,
    new.created_by,
    'active',
    now()
  );
  return new;
end;
$$;

revoke all on function private.bootstrap_conversation() from public, anon, authenticated;

create trigger conversations_bootstrap
after insert on public.conversations
for each row execute function private.bootstrap_conversation();

create or replace function private.prepare_conversation_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_creator uuid;
begin
  select created_by into conversation_creator
  from public.conversations
  where id = new.conversation_id;

  if new.user_id = conversation_creator then
    new.status = 'active';
    new.joined_at = coalesce(new.joined_at, now());
  else
    if exists (
      select 1
      from public.user_blocks
      where (blocker_id = new.user_id and blocked_id = conversation_creator)
         or (blocker_id = conversation_creator and blocked_id = new.user_id)
    ) then
      raise exception 'conversation_not_allowed';
    end if;
    new.status = 'requested';
    new.joined_at = null;
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_conversation_participant() from public, anon, authenticated;

create trigger conversation_participants_prepare
before insert on public.conversation_participants
for each row execute function private.prepare_conversation_participant();

create table public.direct_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  media_id uuid references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint direct_messages_body_length check (char_length(body) between 1 and 5000)
);

create index direct_messages_conversation_idx
  on public.direct_messages(conversation_id, created_at desc)
  where deleted_at is null;

create trigger direct_messages_set_updated_at
before update on public.direct_messages
for each row execute function private.set_updated_at();

create or replace function private.prepare_direct_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_direct_message() from public, anon, authenticated;

create trigger direct_messages_prepare
before insert on public.direct_messages
for each row execute function private.prepare_direct_message();

create or replace function private.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function private.touch_conversation_from_message() from public, anon, authenticated;

create trigger direct_messages_touch_conversation
after insert on public.direct_messages
for each row execute function private.touch_conversation_from_message();

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  type public.notification_type not null,
  priority public.priority_level not null default 'normal',
  title text not null,
  body text not null,
  target_space_id uuid references public.community_spaces(id) on delete set null,
  target_observation_id uuid references public.observations(id) on delete set null,
  target_post_id uuid references public.posts(id) on delete set null,
  target_conversation_id uuid references public.conversations(id) on delete set null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint notifications_title_length check (char_length(title) between 1 and 180),
  constraint notifications_body_length check (char_length(body) between 1 and 1000),
  constraint notifications_data_object check (jsonb_typeof(data) = 'object')
);

create index notifications_user_idx
  on public.notifications(user_id, read_at, created_at desc);

create table public.content_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  observation_id uuid references public.observations(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  community_message_id uuid references public.community_messages(id) on delete cascade,
  room_message_id uuid references public.room_messages(id) on delete cascade,
  direct_message_id uuid references public.direct_messages(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  category public.moderation_category not null,
  details text not null default '',
  status public.moderation_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_reports_one_target check (
    num_nonnulls(
      observation_id,
      post_id,
      comment_id,
      community_message_id,
      room_message_id,
      direct_message_id,
      profile_id
    ) = 1
  ),
  constraint content_reports_details_length check (char_length(details) <= 2000)
);

create index content_reports_reporter_idx on public.content_reports(reporter_id, created_at desc);
create index content_reports_community_idx on public.content_reports(community_id, status, created_at)
  where community_id is not null;

create trigger content_reports_set_updated_at
before update on public.content_reports
for each row execute function private.set_updated_at();

create or replace function private.prepare_content_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.reporter_id = (select auth.uid());
  end if;
  new.status = 'open';
  return new;
end;
$$;

revoke all on function private.prepare_content_report() from public, anon, authenticated;

create trigger content_reports_prepare
before insert on public.content_reports
for each row execute function private.prepare_content_report();

create table public.moderation_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid unique references public.content_reports(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority public.priority_level not null default 'normal',
  category public.moderation_category not null,
  title text not null,
  summary text not null,
  content_snapshot jsonb not null default '{}',
  status public.moderation_status not null default 'open',
  previous_actions integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint moderation_cases_title_length check (char_length(title) between 1 and 180),
  constraint moderation_cases_summary_length check (char_length(summary) between 1 and 4000),
  constraint moderation_cases_snapshot_object check (jsonb_typeof(content_snapshot) = 'object'),
  constraint moderation_cases_previous_actions check (previous_actions >= 0)
);

create index moderation_cases_queue_idx
  on public.moderation_cases(community_id, status, priority, created_at);

create trigger moderation_cases_set_updated_at
before update on public.moderation_cases
for each row execute function private.set_updated_at();

create table public.moderation_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action public.moderation_action not null,
  reason text not null,
  duration_minutes integer,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint moderation_actions_reason_length check (char_length(reason) between 1 and 4000),
  constraint moderation_actions_duration check (duration_minutes is null or duration_minutes between 1 and 525600),
  constraint moderation_actions_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index moderation_actions_case_idx on public.moderation_actions(case_id, created_at desc);

create table public.moderation_appeals (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  status public.moderation_status not null default 'appealed',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, appellant_id),
  constraint moderation_appeals_body_length check (char_length(body) between 10 and 4000)
);

create trigger moderation_appeals_set_updated_at
before update on public.moderation_appeals
for each row execute function private.set_updated_at();

create table private.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid,
  community_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint audit_log_action_length check (char_length(action) between 1 and 120),
  constraint audit_log_target_table_length check (char_length(target_table) between 1 and 120),
  constraint audit_log_metadata_object check (jsonb_typeof(metadata) = 'object')
);

revoke all on private.audit_log from public, anon, authenticated;

create or replace function private.is_platform_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('moderator', 'admin')
      and deleted_at is null
  );
$$;

revoke all on function private.is_platform_moderator() from public;
grant execute on function private.is_platform_moderator() to authenticated;

create or replace function private.open_case_from_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.moderation_cases (
    report_id,
    community_id,
    priority,
    category,
    title,
    summary,
    content_snapshot
  )
  values (
    new.id,
    new.community_id,
    case when new.category in ('safety', 'privacy') then 'high' else 'normal' end,
    new.category,
    'Nouveau signalement',
    coalesce(nullif(new.details, ''), 'Signalement a examiner.'),
    jsonb_build_object(
      'observation_id', new.observation_id,
      'post_id', new.post_id,
      'comment_id', new.comment_id,
      'community_message_id', new.community_message_id,
      'room_message_id', new.room_message_id,
      'direct_message_id', new.direct_message_id,
      'profile_id', new.profile_id
    )
  );
  return new;
end;
$$;

revoke all on function private.open_case_from_report() from public, anon, authenticated;

create trigger content_reports_open_case
after insert on public.content_reports
for each row execute function private.open_case_from_report();

create or replace function private.log_moderation_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_community uuid;
begin
  select community_id into target_community
  from public.moderation_cases
  where id = new.case_id;

  insert into private.audit_log (
    actor_id,
    action,
    target_table,
    target_id,
    community_id,
    metadata
  )
  values (
    new.actor_id,
    'moderation.' || new.action::text,
    'moderation_cases',
    new.case_id,
    target_community,
    jsonb_build_object('reason', new.reason, 'duration_minutes', new.duration_minutes)
  );
  return new;
end;
$$;

revoke all on function private.log_moderation_action() from public, anon, authenticated;

create trigger moderation_actions_audit
after insert on public.moderation_actions
for each row execute function private.log_moderation_action();

create table public.notebook_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete set null,
  title text not null,
  note text not null,
  place text not null default '',
  media_id uuid references public.media_assets(id) on delete set null,
  visibility public.content_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notebook_entries_title_length check (char_length(title) between 1 and 160),
  constraint notebook_entries_note_length check (char_length(note) between 1 and 10000),
  constraint notebook_entries_place_length check (char_length(place) <= 160)
);

create index notebook_entries_user_idx on public.notebook_entries(user_id, created_at desc);

create trigger notebook_entries_set_updated_at
before update on public.notebook_entries
for each row execute function private.set_updated_at();

create table public.learning_lessons (
  id uuid primary key default extensions.gen_random_uuid(),
  slug extensions.citext not null unique,
  category text not null,
  title text not null,
  summary text not null,
  duration_minutes smallint not null,
  level text not null,
  media_id uuid references public.media_assets(id) on delete set null,
  content jsonb not null default '{}',
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_lessons_category check (category in ('radar', 'clouds', 'safety', 'winter', 'wind')),
  constraint learning_lessons_title_length check (char_length(title) between 3 and 180),
  constraint learning_lessons_summary_length check (char_length(summary) between 1 and 1000),
  constraint learning_lessons_duration check (duration_minutes between 1 and 240),
  constraint learning_lessons_level check (level in ('discover', 'understand', 'advanced')),
  constraint learning_lessons_content_object check (jsonb_typeof(content) = 'object')
);

create trigger learning_lessons_set_updated_at
before update on public.learning_lessons
for each row execute function private.set_updated_at();

create table public.lesson_progress (
  lesson_id uuid not null references public.learning_lessons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress smallint not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (lesson_id, user_id),
  constraint lesson_progress_range check (progress between 0 and 100)
);

create table public.alert_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_place_id uuid references public.saved_places(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  phenomena public.observation_category[] not null default '{}',
  radius_km smallint not null default 20,
  enabled boolean not null default true,
  quiet_from time,
  quiet_to time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_subscriptions_target check (num_nonnulls(saved_place_id, community_id) = 1),
  constraint alert_subscriptions_radius check (radius_km between 2 and 100),
  constraint alert_subscriptions_phenomena_count check (cardinality(phenomena) between 1 and 14)
);

create trigger alert_subscriptions_set_updated_at
before update on public.alert_subscriptions
for each row execute function private.set_updated_at();

create table public.push_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint_hash text not null,
  platform text not null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint_hash),
  constraint push_devices_hash_length check (char_length(endpoint_hash) between 32 and 128),
  constraint push_devices_platform check (platform in ('web', 'ios', 'android'))
);

create or replace function private.refresh_room_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.room_id, old.room_id);
  update public.storm_rooms
  set
    participant_count = (
      select count(*)::integer from public.room_members
      where room_id = target_id and left_at is null
    ),
    observation_count = (
      select count(*)::integer from public.room_observations
      where room_id = target_id
    ),
    message_count = (
      select count(*)::integer from public.room_messages
      where room_id = target_id and deleted_at is null
    ),
    source_count = (
      select count(*)::integer from public.room_messages
      where room_id = target_id and deleted_at is null and kind = 'source'
    )
  where id = target_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.refresh_room_counters() from public, anon, authenticated;

create trigger room_members_refresh_counter
after insert or update or delete on public.room_members
for each row execute function private.refresh_room_counters();

create trigger room_messages_refresh_counter
after insert or update or delete on public.room_messages
for each row execute function private.refresh_room_counters();

create trigger room_observations_refresh_counter
after insert or delete on public.room_observations
for each row execute function private.refresh_room_counters();

alter table public.storm_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_observations enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.direct_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.moderation_appeals enable row level security;
alter table public.notebook_entries enable row level security;
alter table public.learning_lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.alert_subscriptions enable row level security;
alter table public.push_devices enable row level security;

create policy storm_rooms_read
on public.storm_rooms for select
to anon, authenticated
using (
  archived_at is null
  and (
    visibility in ('public', 'unlisted')
    or private.is_room_member(id)
  )
);

create policy storm_rooms_insert
on public.storm_rooms for insert
to authenticated
with check (
  (select auth.uid()) = creator_id
  and (
    community_id is null
    or private.is_community_member(community_id)
  )
);

create policy storm_rooms_update_host
on public.storm_rooms for update
to authenticated
using (
  (select auth.uid()) = creator_id
  or private.can_moderate_community(community_id)
)
with check (
  (select auth.uid()) = creator_id
  or private.can_moderate_community(community_id)
);

create policy room_members_read
on public.room_members for select
to authenticated
using (private.is_room_member(room_id));

create policy room_members_join
on public.room_members for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.storm_rooms
    where storm_rooms.id = room_members.room_id
      and (
        storm_rooms.visibility in ('public', 'unlisted')
        or storm_rooms.creator_id = (select auth.uid())
        or (
          storm_rooms.community_id is not null
          and private.is_community_member(storm_rooms.community_id)
        )
      )
  )
);

create policy room_members_leave
on public.room_members for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy room_messages_read
on public.room_messages for select
to anon, authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.storm_rooms
    where storm_rooms.id = room_messages.room_id
  )
);

create policy room_messages_insert
on public.room_messages for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and private.is_room_member(room_id)
);

create policy room_messages_update_own
on public.room_messages for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy room_messages_delete_own
on public.room_messages for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy room_observations_read
on public.room_observations for select
to anon, authenticated
using (
  exists (select 1 from public.storm_rooms where storm_rooms.id = room_observations.room_id)
);

create policy room_observations_insert
on public.room_observations for insert
to authenticated
with check (
  (select auth.uid()) = added_by
  and private.is_room_member(room_id)
  and exists (
    select 1 from public.observations
    where observations.id = room_observations.observation_id
  )
);

create policy room_observations_delete
on public.room_observations for delete
to authenticated
using (
  (select auth.uid()) = added_by
  or private.is_room_member(room_id)
);

create policy conversations_participant_read
on public.conversations for select
to authenticated
using (private.is_conversation_participant(id));

create policy conversations_insert
on public.conversations for insert
to authenticated
with check ((select auth.uid()) = created_by);

create policy conversations_update
on public.conversations for update
to authenticated
using (private.is_active_conversation_participant(id))
with check (private.is_active_conversation_participant(id));

create policy conversation_participants_read
on public.conversation_participants for select
to authenticated
using (private.is_conversation_participant(conversation_id));

create policy conversation_participants_add
on public.conversation_participants for insert
to authenticated
with check (private.is_active_conversation_participant(conversation_id));

create policy conversation_participants_update_self
on public.conversation_participants for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy direct_messages_read
on public.direct_messages for select
to authenticated
using (
  deleted_at is null
  and private.is_conversation_participant(conversation_id)
);

create policy direct_messages_insert
on public.direct_messages for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and private.is_active_conversation_participant(conversation_id)
);

create policy direct_messages_update_own
on public.direct_messages for update
to authenticated
using ((select auth.uid()) = author_id and deleted_at is null)
with check ((select auth.uid()) = author_id);

create policy notifications_self
on public.notifications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy notifications_update_self
on public.notifications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy notifications_delete_self
on public.notifications for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy content_reports_read_own_or_moderator
on public.content_reports for select
to authenticated
using (
  (select auth.uid()) = reporter_id
  or private.is_platform_moderator()
  or (
    community_id is not null
    and private.can_moderate_community(community_id)
  )
);

create policy content_reports_insert
on public.content_reports for insert
to authenticated
with check ((select auth.uid()) = reporter_id);

create policy moderation_cases_read
on public.moderation_cases for select
to authenticated
using (
  private.is_platform_moderator()
  or (
    community_id is not null
    and private.can_moderate_community(community_id)
  )
);

create policy moderation_cases_update
on public.moderation_cases for update
to authenticated
using (
  private.is_platform_moderator()
  or (
    community_id is not null
    and private.can_moderate_community(community_id)
  )
)
with check (
  private.is_platform_moderator()
  or (
    community_id is not null
    and private.can_moderate_community(community_id)
  )
);

create policy moderation_actions_read
on public.moderation_actions for select
to authenticated
using (
  exists (
    select 1 from public.moderation_cases
    where moderation_cases.id = moderation_actions.case_id
  )
);

create policy moderation_actions_insert
on public.moderation_actions for insert
to authenticated
with check (
  (select auth.uid()) = actor_id
  and exists (
    select 1 from public.moderation_cases
    where moderation_cases.id = moderation_actions.case_id
  )
);

create policy moderation_appeals_self
on public.moderation_appeals for select
to authenticated
using (
  (select auth.uid()) = appellant_id
  or private.is_platform_moderator()
  or exists (
    select 1
    from public.moderation_cases
    where moderation_cases.id = moderation_appeals.case_id
      and moderation_cases.community_id is not null
      and private.can_moderate_community(moderation_cases.community_id)
  )
);

create policy moderation_appeals_insert
on public.moderation_appeals for insert
to authenticated
with check ((select auth.uid()) = appellant_id);

create policy moderation_appeals_review
on public.moderation_appeals for update
to authenticated
using (
  private.is_platform_moderator()
  or exists (
    select 1
    from public.moderation_cases
    where moderation_cases.id = moderation_appeals.case_id
      and moderation_cases.community_id is not null
      and private.can_moderate_community(moderation_cases.community_id)
  )
)
with check (
  private.is_platform_moderator()
  or exists (
    select 1
    from public.moderation_cases
    where moderation_cases.id = moderation_appeals.case_id
      and moderation_cases.community_id is not null
      and private.can_moderate_community(moderation_cases.community_id)
  )
);

create policy notebook_entries_self
on public.notebook_entries for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy learning_lessons_public_read
on public.learning_lessons for select
to anon, authenticated
using (status = 'published' and published_at is not null);

create policy lesson_progress_self
on public.lesson_progress for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy alert_subscriptions_self
on public.alert_subscriptions for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy push_devices_self
on public.push_devices for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.storm_rooms from anon, authenticated;
revoke all on public.room_members from anon, authenticated;
revoke all on public.room_messages from anon, authenticated;
revoke all on public.room_observations from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.conversation_participants from anon, authenticated;
revoke all on public.direct_messages from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.content_reports from anon, authenticated;
revoke all on public.moderation_cases from anon, authenticated;
revoke all on public.moderation_actions from anon, authenticated;
revoke all on public.moderation_appeals from anon, authenticated;
revoke all on public.notebook_entries from anon, authenticated;
revoke all on public.learning_lessons from anon, authenticated;
revoke all on public.lesson_progress from anon, authenticated;
revoke all on public.alert_subscriptions from anon, authenticated;
revoke all on public.push_devices from anon, authenticated;

grant select on public.storm_rooms to anon, authenticated;
grant insert (creator_id, community_id, title, short_title, summary, area, phenomenon, status, visibility, starts_at, ends_at, latitude, longitude, media_id)
  on public.storm_rooms to authenticated;
grant update (title, short_title, summary, area, phenomenon, status, visibility, starts_at, ends_at, last_activity_at, latitude, longitude, media_id, archived_at)
  on public.storm_rooms to authenticated;
grant delete on public.storm_rooms to authenticated;
grant select on public.room_members to authenticated;
grant insert (room_id, user_id) on public.room_members to authenticated;
grant update (last_read_at, left_at) on public.room_members to authenticated;
grant select on public.room_messages to anon, authenticated;
grant insert (room_id, author_id, kind, body, media_id) on public.room_messages to authenticated;
grant update (body, media_id, deleted_at) on public.room_messages to authenticated;
grant delete on public.room_messages to authenticated;
grant select on public.room_observations to anon, authenticated;
grant insert, delete on public.room_observations to authenticated;

grant select on public.conversations to authenticated;
grant insert (created_by, title, kind) on public.conversations to authenticated;
grant update (title, archived_at) on public.conversations to authenticated;
grant select on public.conversation_participants to authenticated;
grant insert (conversation_id, user_id) on public.conversation_participants to authenticated;
grant update (status, last_read_at, muted_until) on public.conversation_participants to authenticated;
grant select on public.direct_messages to authenticated;
grant insert (conversation_id, author_id, body, media_id) on public.direct_messages to authenticated;
grant update (body, media_id, deleted_at) on public.direct_messages to authenticated;
grant delete on public.direct_messages to authenticated;

grant select, update (read_at), delete on public.notifications to authenticated;
grant select, insert on public.content_reports to authenticated;
grant select, update on public.moderation_cases to authenticated;
grant select, insert on public.moderation_actions to authenticated;
grant select, insert, update on public.moderation_appeals to authenticated;
grant select, insert, update, delete on public.notebook_entries to authenticated;
grant select on public.learning_lessons to anon, authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;
grant select, insert, update, delete on public.alert_subscriptions to authenticated;
grant select, insert, update, delete on public.push_devices to authenticated;

commit;
