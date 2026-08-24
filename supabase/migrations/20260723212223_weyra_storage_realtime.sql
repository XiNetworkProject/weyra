begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'weyra-avatars',
    'weyra-avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'weyra-observation-uploads',
    'weyra-observation-uploads',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  ),
  (
    'weyra-community-media',
    'weyra-community-media',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
  ),
  (
    'weyra-public-media',
    'weyra-public-media',
    true,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_read_approved
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'weyra-avatars'
  and exists (
    select 1
    from public.media_assets
    where media_assets.bucket_id = storage.objects.bucket_id
      and media_assets.object_path = storage.objects.name
      and media_assets.moderation_status = 'approved'
      and media_assets.visibility in ('public', 'unlisted')
  )
);

create policy avatars_read_owner
on storage.objects for select
to authenticated
using (
  bucket_id = 'weyra-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_insert_owner
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'weyra-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_update_owner
on storage.objects for update
to authenticated
using (
  bucket_id = 'weyra-avatars'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'weyra-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_delete_owner
on storage.objects for delete
to authenticated
using (
  bucket_id = 'weyra-avatars'
  and owner_id = (select auth.uid()::text)
);

create policy observation_uploads_read_owner
on storage.objects for select
to authenticated
using (
  bucket_id = 'weyra-observation-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy observation_uploads_insert_owner
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'weyra-observation-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy observation_uploads_update_owner
on storage.objects for update
to authenticated
using (
  bucket_id = 'weyra-observation-uploads'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'weyra-observation-uploads'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy observation_uploads_delete_owner
on storage.objects for delete
to authenticated
using (
  bucket_id = 'weyra-observation-uploads'
  and owner_id = (select auth.uid()::text)
);

create policy community_media_read_member
on storage.objects for select
to authenticated
using (
  bucket_id = 'weyra-community-media'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then private.is_community_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy community_media_insert_member
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'weyra-community-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then private.is_community_member(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy community_media_update_owner
on storage.objects for update
to authenticated
using (
  bucket_id = 'weyra-community-media'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'weyra-community-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy community_media_delete_owner
on storage.objects for delete
to authenticated
using (
  bucket_id = 'weyra-community-media'
  and owner_id = (select auth.uid()::text)
);

create policy public_media_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'weyra-public-media');

create table private.rate_limits (
  user_id uuid not null,
  action text not null,
  window_started_at timestamptz not null,
  action_count integer not null default 0,
  primary key (user_id, action),
  constraint rate_limits_action_length check (char_length(action) between 1 and 80),
  constraint rate_limits_count check (action_count >= 0)
);

revoke all on private.rate_limits from public, anon, authenticated;

create or replace function private.enforce_rate_limit(
  action_name text,
  maximum_actions integer,
  window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_count integer;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    return;
  end if;

  insert into private.rate_limits (
    user_id,
    action,
    window_started_at,
    action_count
  )
  values (
    current_user_id,
    action_name,
    now(),
    1
  )
  on conflict (user_id, action) do update
  set
    window_started_at = case
      when private.rate_limits.window_started_at <= now() - make_interval(secs => window_seconds)
        then now()
      else private.rate_limits.window_started_at
    end,
    action_count = case
      when private.rate_limits.window_started_at <= now() - make_interval(secs => window_seconds)
        then 1
      else private.rate_limits.action_count + 1
    end
  returning action_count into current_count;

  if current_count > maximum_actions then
    raise exception using
      errcode = 'P0001',
      message = 'rate_limit_exceeded',
      hint = action_name;
  end if;
end;
$$;

revoke all on function private.enforce_rate_limit(text, integer, integer)
  from public, anon, authenticated;

create or replace function private.rate_limit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enforce_rate_limit(
    tg_argv[0],
    tg_argv[1]::integer,
    tg_argv[2]::integer
  );
  return new;
end;
$$;

revoke all on function private.rate_limit_trigger() from public, anon, authenticated;

create trigger observations_rate_limit
before insert on public.observations
for each row execute function private.rate_limit_trigger('observations', '12', '600');

create trigger posts_rate_limit
before insert on public.posts
for each row execute function private.rate_limit_trigger('posts', '20', '600');

create trigger comments_rate_limit
before insert on public.comments
for each row execute function private.rate_limit_trigger('comments', '60', '600');

create trigger community_messages_rate_limit
before insert on public.community_messages
for each row execute function private.rate_limit_trigger('community_messages', '120', '300');

create trigger room_messages_rate_limit
before insert on public.room_messages
for each row execute function private.rate_limit_trigger('room_messages', '120', '300');

create trigger direct_messages_rate_limit
before insert on public.direct_messages
for each row execute function private.rate_limit_trigger('direct_messages', '120', '300');

create trigger content_reports_rate_limit
before insert on public.content_reports
for each row execute function private.rate_limit_trigger('content_reports', '10', '3600');

create or replace function public.nearby_observations(
  center_latitude double precision,
  center_longitude double precision,
  radius_km double precision default 50,
  result_limit integer default 200
)
returns setof public.observations
language sql
stable
security invoker
set search_path = ''
as $$
  select observations.*
  from public.observations
  where observations.deleted_at is null
    and observations.status = 'published'
    and extensions.st_dwithin(
      observations.position,
      extensions.st_setsrid(
        extensions.st_makepoint(center_longitude, center_latitude),
        4326
      )::extensions.geography,
      least(greatest(radius_km, 1), 500) * 1000
    )
  order by observations.created_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

revoke all on function public.nearby_observations(double precision, double precision, double precision, integer)
  from public;
grant execute on function public.nearby_observations(double precision, double precision, double precision, integer)
  to anon, authenticated;

create or replace function public.nearby_communities(
  center_latitude double precision,
  center_longitude double precision,
  radius_km double precision default 250,
  result_limit integer default 50
)
returns setof public.communities
language sql
stable
security invoker
set search_path = ''
as $$
  select communities.*
  from public.communities
  where communities.deleted_at is null
    and extensions.st_dwithin(
      communities.center_position,
      extensions.st_setsrid(
        extensions.st_makepoint(center_longitude, center_latitude),
        4326
      )::extensions.geography,
      least(greatest(radius_km, 1), 1000) * 1000
    )
  order by communities.member_count desc, communities.created_at desc
  limit least(greatest(result_limit, 1), 100);
$$;

revoke all on function public.nearby_communities(double precision, double precision, double precision, integer)
  from public;
grant execute on function public.nearby_communities(double precision, double precision, double precision, integer)
  to anon, authenticated;

create or replace function private.notify_observation_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  observation_author uuid;
begin
  if new.outcome <> 'confirm' then
    return new;
  end if;

  select author_id into observation_author
  from public.observations
  where id = new.observation_id;

  if observation_author is not null and observation_author <> new.user_id then
    insert into public.notifications (
      user_id,
      type,
      priority,
      title,
      body,
      target_observation_id
    )
    values (
      observation_author,
      'observation',
      'normal',
      'Observation confirmee',
      'Une personne a confirme votre observation.',
      new.observation_id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_observation_confirmation()
  from public, anon, authenticated;

create trigger observation_confirmations_notify
after insert on public.observation_confirmations
for each row execute function private.notify_observation_confirmation();

create or replace function private.notify_comment_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_author uuid;
  target_community uuid;
begin
  if new.post_id is not null then
    select author_id, community_id into target_author, target_community
    from public.posts
    where id = new.post_id;
  elsif new.observation_id is not null then
    select author_id, community_id into target_author, target_community
    from public.observations
    where id = new.observation_id;
  end if;

  if target_author is not null and target_author <> new.author_id then
    insert into public.notifications (
      user_id,
      community_id,
      type,
      priority,
      title,
      body,
      target_observation_id,
      target_post_id
    )
    values (
      target_author,
      target_community,
      'reply',
      'normal',
      'Nouvelle reponse',
      'Une personne a repondu a votre publication.',
      new.observation_id,
      new.post_id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_comment_target() from public, anon, authenticated;

create trigger comments_notify_target
after insert on public.comments
for each row execute function private.notify_comment_target();

create or replace function private.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    user_id,
    type,
    priority,
    title,
    body,
    target_conversation_id
  )
  select
    participants.user_id,
    'reply',
    'normal',
    'Nouveau message',
    'Vous avez recu un nouveau message prive.',
    new.conversation_id
  from public.conversation_participants participants
  where participants.conversation_id = new.conversation_id
    and participants.user_id <> new.author_id
    and participants.status = 'active';
  return new;
end;
$$;

revoke all on function private.notify_direct_message() from public, anon, authenticated;

create trigger direct_messages_notify
after insert on public.direct_messages
for each row execute function private.notify_direct_message();

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'observations',
    'posts',
    'comments',
    'communities',
    'community_spaces',
    'community_messages',
    'room_messages',
    'direct_messages',
    'notifications',
    'community_events'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array realtime_tables loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          table_name
        );
      end if;
    end loop;
  end if;
end;
$$;

commit;
