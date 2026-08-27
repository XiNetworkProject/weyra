begin;

create or replace function private.prepare_media_asset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.owner_id = (select auth.uid());
  end if;
  -- A media_assets row is created only after the object upload has succeeded.
  -- It is therefore ready for moderation, but never approved automatically.
  new.moderation_status = 'pending';
  return new;
end;
$$;

revoke all on function private.prepare_media_asset() from public, anon, authenticated;

create or replace function private.prepare_observation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is not null then
    new.author_id = current_user_id;
    new.is_demo = false;
  end if;

  if new.media_id is not null and not exists (
    select 1
    from public.media_assets
    where media_assets.id = new.media_id
      and media_assets.owner_id = new.author_id
      and (
        current_user_id is null
        or media_assets.bucket_id = 'weyra-observation-uploads'
      )
  ) then
    raise insufficient_privilege using
      message = 'The observation media must belong to its author.';
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

drop policy if exists observation_uploads_read_approved on storage.objects;
create policy observation_uploads_read_approved
on storage.objects for select
to anon, authenticated
using (
  bucket_id = 'weyra-observation-uploads'
  and exists (
    select 1
    from public.media_assets
    join public.observations
      on observations.media_id = media_assets.id
    where media_assets.bucket_id = storage.objects.bucket_id
      and media_assets.object_path = storage.objects.name
      and media_assets.moderation_status = 'approved'
      and media_assets.visibility in ('public', 'unlisted')
      and observations.status = 'published'
      and observations.visibility in ('public', 'unlisted')
      and observations.deleted_at is null
  )
);

drop policy if exists observations_read_platform_moderator on public.observations;
create policy observations_read_platform_moderator
on public.observations for select
to authenticated
using (private.is_platform_moderator());

drop policy if exists media_assets_read_platform_moderator on public.media_assets;
create policy media_assets_read_platform_moderator
on public.media_assets for select
to authenticated
using (private.is_platform_moderator());

drop policy if exists observation_uploads_read_platform_moderator on storage.objects;
create policy observation_uploads_read_platform_moderator
on storage.objects for select
to authenticated
using (
  bucket_id = 'weyra-observation-uploads'
  and private.is_platform_moderator()
);

create or replace function public.moderate_observation(
  target_observation_id uuid,
  review_decision text,
  review_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_media_id uuid;
  target_visibility public.content_visibility;
  resulting_status public.content_status;
  normalized_reason text := trim(coalesce(review_reason, ''));
  media_rights_confirmed boolean;
begin
  if actor_id is null or not private.is_platform_moderator() then
    raise insufficient_privilege using message = 'Platform moderator access is required.';
  end if;

  if review_decision not in ('approve', 'reject') then
    raise check_violation using message = 'Unsupported observation moderation decision.';
  end if;
  if char_length(normalized_reason) not between 3 and 2000 then
    raise check_violation using message = 'A moderation reason between 3 and 2000 characters is required.';
  end if;

  select media_id, visibility
  into target_media_id, target_visibility
  from public.observations
  where id = target_observation_id
    and deleted_at is null
  for update;

  if not found then
    raise no_data_found using message = 'Observation not found.';
  end if;

  if review_decision = 'approve' then
    if target_media_id is not null then
      select rights_confirmed
      into media_rights_confirmed
      from public.media_assets
      where id = target_media_id
      for update;

      if not coalesce(media_rights_confirmed, false) then
        raise check_violation using message = 'Media rights confirmation is required before approval.';
      end if;

      update public.media_assets
      set
        moderation_status = 'approved',
        visibility = case
          when target_visibility in ('public', 'unlisted') then target_visibility
          else 'private'::public.content_visibility
        end
      where id = target_media_id;
    end if;

    update public.observations
    set
      status = 'published',
      published_at = coalesce(published_at, now()),
      deleted_at = null
    where id = target_observation_id
    returning status into resulting_status;
  else
    if target_media_id is not null then
      update public.media_assets
      set moderation_status = 'rejected', visibility = 'private'
      where id = target_media_id;
    end if;

    update public.observations
    set status = 'rejected', published_at = null, deleted_at = now()
    where id = target_observation_id
    returning status into resulting_status;
  end if;

  update public.moderation_cases
  set status = 'resolved', resolved_at = now()
  where report_id in (
    select id
    from public.content_reports
    where observation_id = target_observation_id
      and status in ('open', 'reviewing', 'appealed')
  );

  update public.content_reports
  set status = 'resolved'
  where observation_id = target_observation_id
    and status in ('open', 'reviewing', 'appealed');

  insert into private.audit_log (
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    actor_id,
    'observation.' || review_decision,
    'observations',
    target_observation_id,
    jsonb_build_object('reason', normalized_reason)
  );

  return jsonb_build_object(
    'id', target_observation_id,
    'status', resulting_status,
    'decision', review_decision,
    'reviewedAt', now()
  );
end;
$$;

revoke all on function public.moderate_observation(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.moderate_observation(uuid, text, text)
to authenticated;

commit;
