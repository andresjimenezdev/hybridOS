alter table public.workout_template_exercises
  alter column target_reps_min drop not null,
  alter column target_reps_max drop not null,
  add column target_duration_min_seconds integer check (target_duration_min_seconds > 0),
  add column target_duration_max_seconds integer check (target_duration_max_seconds >= target_duration_min_seconds);

alter table public.workout_template_exercises
  add constraint template_exercise_target_present check (
    (target_reps_min is not null and target_reps_max is not null)
    or (target_duration_min_seconds is not null and target_duration_max_seconds is not null)
  );

alter table public.strength_exercise_logs
  add column target_duration_min_seconds integer check (target_duration_min_seconds > 0),
  add column target_duration_max_seconds integer check (target_duration_max_seconds >= target_duration_min_seconds);

alter table public.strength_sets
  add column duration_seconds integer check (duration_seconds > 0);

create table public.planned_session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  planned_session_id uuid not null,
  exercise_id uuid not null,
  position smallint not null check (position > 0),
  target_sets smallint not null check (target_sets between 1 and 20),
  target_reps_min smallint check (target_reps_min between 1 and 100),
  target_reps_max smallint check (target_reps_max >= target_reps_min and target_reps_max <= 100),
  target_duration_min_seconds integer check (target_duration_min_seconds > 0),
  target_duration_max_seconds integer check (target_duration_max_seconds >= target_duration_min_seconds),
  target_rir_min numeric(3,1) check (target_rir_min between 0 and 10),
  target_rir_max numeric(3,1) check (target_rir_max >= target_rir_min and target_rir_max <= 10),
  rest_seconds smallint check (rest_seconds between 0 and 1800),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (planned_session_id, position),
  unique (planned_session_id, exercise_id),
  check (
    (target_reps_min is not null and target_reps_max is not null)
    or (target_duration_min_seconds is not null and target_duration_max_seconds is not null)
  ),
  constraint planned_exercises_plan_owner_fk foreign key (planned_session_id, user_id)
    references public.planned_sessions(id, user_id) on delete cascade,
  constraint planned_exercises_exercise_owner_fk foreign key (exercise_id, user_id)
    references public.exercises(id, user_id) on delete restrict
);

create index planned_session_exercises_plan_idx
  on public.planned_session_exercises(user_id, planned_session_id, position);

create trigger set_planned_session_exercises_updated_at
before update on public.planned_session_exercises
for each row execute function public.set_updated_at();

alter table public.planned_session_exercises enable row level security;
create policy "planned_session_exercises_select_own" on public.planned_session_exercises
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "planned_session_exercises_insert_own" on public.planned_session_exercises
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "planned_session_exercises_update_own" on public.planned_session_exercises
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "planned_session_exercises_delete_own" on public.planned_session_exercises
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.planned_session_exercises to authenticated;

create or replace function public.bootstrap_strength_defaults()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.profiles (id) values (current_user_id) on conflict (id) do nothing;

  insert into public.exercises (user_id, name, muscle_group, movement_pattern, equipment, external_key, external_source)
  values
    (current_user_id, 'Sentadilla', 'Pierna', 'Sentadilla', 'Barra', 'squat', 'hybridos_defaults'),
    (current_user_id, 'Press banca', 'Pecho', 'Empuje horizontal', 'Barra', 'bench_press', 'hybridos_defaults'),
    (current_user_id, 'Remo sentado cable', 'Espalda', 'Tirón horizontal', 'Cable', 'seated_cable_row', 'hybridos_defaults'),
    (current_user_id, 'Peso muerto rumano con mancuernas', 'Pierna', 'Bisagra de cadera', 'Mancuernas', 'db_rdl', 'hybridos_defaults'),
    (current_user_id, 'Elevaciones laterales', 'Hombro', 'Abducción de hombro', 'Mancuernas', 'lateral_raise', 'hybridos_defaults'),
    (current_user_id, 'Gemelos', 'Pantorrilla', 'Flexión plantar', 'Máquina', 'calf_raise', 'hybridos_defaults'),
    (current_user_id, 'Plancha', 'Core', 'Anti-extensión', 'Peso corporal', 'plank', 'hybridos_defaults'),
    (current_user_id, 'Prensa inclinada', 'Pierna', 'Sentadilla', 'Máquina', 'leg_press', 'hybridos_defaults'),
    (current_user_id, 'Press inclinado mancuernas', 'Pecho', 'Empuje inclinado', 'Mancuernas', 'incline_db_press', 'hybridos_defaults'),
    (current_user_id, 'Jalón al pecho', 'Espalda', 'Tirón vertical', 'Cable', 'lat_pulldown', 'hybridos_defaults'),
    (current_user_id, 'Extensión de cuádriceps', 'Pierna', 'Extensión de rodilla', 'Máquina', 'leg_extension', 'hybridos_defaults'),
    (current_user_id, 'Curl femoral', 'Pierna', 'Flexión de rodilla', 'Máquina', 'leg_curl', 'hybridos_defaults'),
    (current_user_id, 'Reverse pec deck', 'Hombro', 'Apertura posterior', 'Máquina', 'reverse_pec_deck', 'hybridos_defaults'),
    (current_user_id, 'Pallof press', 'Core', 'Anti-rotación', 'Cable', 'pallof_press', 'hybridos_defaults'),
    (current_user_id, 'Hip thrust', 'Glúteo', 'Extensión de cadera', 'Barra', 'hip_thrust', 'hybridos_defaults'),
    (current_user_id, 'Remo pecho apoyado', 'Espalda', 'Tirón horizontal', 'Mancuernas', 'chest_supported_row', 'hybridos_defaults'),
    (current_user_id, 'Goblet squat', 'Pierna', 'Sentadilla', 'Mancuerna', 'goblet_squat', 'hybridos_defaults'),
    (current_user_id, 'Curl bíceps', 'Bíceps', 'Flexión de codo', 'Mancuernas', 'biceps_curl', 'hybridos_defaults'),
    (current_user_id, 'Extensión tríceps', 'Tríceps', 'Extensión de codo', 'Cable', 'triceps_pushdown', 'hybridos_defaults')
  on conflict (user_id, name) do update
    set external_key = coalesce(public.exercises.external_key, excluded.external_key),
        external_source = coalesce(public.exercises.external_source, excluded.external_source);

  insert into public.workout_templates (user_id, name, estimated_duration_minutes)
  values
    (current_user_id, 'Full Body A', 65),
    (current_user_id, 'Full Body B', 65),
    (current_user_id, 'Full Body C', 65)
  on conflict (user_id, name) do nothing;
end;
$$;

create or replace function public.start_strength_session(template_id uuid, planned_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_session_id uuid;
  session_name text;
  has_planned_snapshot boolean := false;
begin
  if planned_id is not null then
    select title into session_name from public.planned_sessions
    where id = planned_id and user_id = current_user_id and status = 'planned' and kind = 'strength';
    if session_name is null then raise exception 'Planned session not found'; end if;
    select exists (
      select 1 from public.planned_session_exercises
      where planned_session_id = planned_id and user_id = current_user_id
    ) into has_planned_snapshot;
  else
    select name into session_name from public.workout_templates
    where id = template_id and user_id = current_user_id and is_active;
    if session_name is null then raise exception 'Template not found'; end if;
  end if;

  if not has_planned_snapshot and not exists (
    select 1 from public.workout_template_exercises
    where workout_template_id = template_id and user_id = current_user_id
  ) then raise exception 'Session has no exercises'; end if;

  select id into new_session_id from public.strength_sessions
  where user_id = current_user_id and status = 'in_progress' limit 1;
  if new_session_id is not null then return new_session_id; end if;

  insert into public.strength_sessions (user_id, planned_session_id, workout_template_id, name)
  values (current_user_id, planned_id, template_id, session_name)
  returning id into new_session_id;

  if has_planned_snapshot then
    with inserted_logs as (
      insert into public.strength_exercise_logs (
        user_id, strength_session_id, exercise_id, position, target_sets,
        target_reps_min, target_reps_max, target_duration_min_seconds,
        target_duration_max_seconds, target_rir, target_rir_min, target_rir_max, rest_seconds, notes
      )
      select current_user_id, new_session_id, exercise_id, position, target_sets,
        target_reps_min, target_reps_max, target_duration_min_seconds,
        target_duration_max_seconds, target_rir_max, target_rir_min, target_rir_max, rest_seconds, notes
      from public.planned_session_exercises
      where planned_session_id = planned_id and user_id = current_user_id
      order by position
      returning id, target_sets
    )
    insert into public.strength_sets (user_id, exercise_log_id, set_number)
    select current_user_id, inserted_logs.id, series_number
    from inserted_logs cross join lateral generate_series(1, inserted_logs.target_sets) as series_number;
  else
    with inserted_logs as (
      insert into public.strength_exercise_logs (
        user_id, strength_session_id, exercise_id, position, target_sets,
        target_reps_min, target_reps_max, target_duration_min_seconds,
        target_duration_max_seconds, target_rir, target_rir_min, target_rir_max, rest_seconds, notes
      )
      select current_user_id, new_session_id, exercise_id, position, target_sets,
        target_reps_min, target_reps_max, target_duration_min_seconds,
        target_duration_max_seconds, target_rir, target_rir_min, target_rir_max, rest_seconds, notes
      from public.workout_template_exercises
      where workout_template_id = template_id and user_id = current_user_id
      order by position
      returning id, target_sets
    )
    insert into public.strength_sets (user_id, exercise_log_id, set_number)
    select current_user_id, inserted_logs.id, series_number
    from inserted_logs cross join lateral generate_series(1, inserted_logs.target_sets) as series_number;
  end if;

  if planned_id is not null then
    update public.planned_sessions set status = 'in_progress'
    where id = planned_id and user_id = current_user_id;
  end if;
  return new_session_id;
end;
$$;
