alter table public.exercises
  add column external_key text,
  add column external_source text;

create unique index exercises_user_external_key_unique
on public.exercises(user_id, external_key);

alter table public.workout_templates
  add column external_key text,
  add column external_source text;

create unique index workout_templates_user_external_key_unique
on public.workout_templates(user_id, external_key);

alter table public.workout_template_exercises
  add column target_rir_min numeric(3,1) check (target_rir_min between 0 and 10),
  add column target_rir_max numeric(3,1) check (target_rir_max between target_rir_min and 10);

alter table public.planned_sessions
  add column external_plan_id text,
  add column session_key text,
  add column source text not null default 'manual',
  add column source_updated_at timestamptz,
  add column import_status text not null default 'ready' check (import_status in ('ready', 'needs_review', 'update_available')),
  add column review_message text,
  add column pending_plan_update jsonb;

create unique index planned_sessions_user_source_key_unique
on public.planned_sessions(user_id, source, session_key);

alter table public.strength_sessions
  add column external_source text,
  add column external_id text;

create unique index strength_sessions_user_external_unique
on public.strength_sessions(user_id, external_source, external_id)
where external_source is not null and external_id is not null;

alter table public.strength_exercise_logs
  add column target_rir_min numeric(3,1) check (target_rir_min between 0 and 10),
  add column target_rir_max numeric(3,1) check (target_rir_max between target_rir_min and 10),
  add column external_source text,
  add column external_id text;

create unique index strength_logs_user_external_unique
on public.strength_exercise_logs(user_id, external_source, external_id)
where external_source is not null and external_id is not null;

alter table public.sync_log
  add column direction text not null default 'outbound' check (direction in ('inbound', 'outbound')),
  add column attempted_at timestamptz,
  add column completed_at timestamptz,
  add column error_message text,
  add column source_updated_at timestamptz;

alter table public.sync_log alter column entity_id drop not null;

create or replace function public.start_strength_session(template_id uuid, planned_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_session_id uuid;
  template_name text;
begin
  select name into template_name from public.workout_templates
  where id = template_id and user_id = current_user_id and is_active;
  if template_name is null then raise exception 'Template not found'; end if;
  if not exists (
    select 1 from public.workout_template_exercises
    where workout_template_id = template_id and user_id = current_user_id
  ) then raise exception 'Template has no exercises'; end if;
  if planned_id is not null and not exists (
    select 1 from public.planned_sessions where id = planned_id and user_id = current_user_id and status = 'planned'
  ) then raise exception 'Planned session not found'; end if;

  select id into new_session_id from public.strength_sessions
  where user_id = current_user_id and status = 'in_progress' limit 1;
  if new_session_id is not null then return new_session_id; end if;

  insert into public.strength_sessions (user_id, planned_session_id, workout_template_id, name)
  values (current_user_id, planned_id, template_id, template_name)
  returning id into new_session_id;

  with inserted_logs as (
    insert into public.strength_exercise_logs (
      user_id, strength_session_id, exercise_id, position, target_sets,
      target_reps_min, target_reps_max, target_rir, target_rir_min, target_rir_max, rest_seconds
    )
    select current_user_id, new_session_id, exercise_id, position, target_sets,
      target_reps_min, target_reps_max, target_rir, target_rir_min, target_rir_max, rest_seconds
    from public.workout_template_exercises
    where workout_template_id = template_id and user_id = current_user_id
    order by position
    returning id, target_sets
  )
  insert into public.strength_sets (user_id, exercise_log_id, set_number)
  select current_user_id, inserted_logs.id, series_number
  from inserted_logs cross join lateral generate_series(1, inserted_logs.target_sets) as series_number;

  if planned_id is not null then
    update public.planned_sessions
    set status = 'in_progress'
    where id = planned_id and user_id = current_user_id;
  end if;

  return new_session_id;
end;
$$;
