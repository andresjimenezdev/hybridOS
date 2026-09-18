create extension if not exists pgcrypto;

create type public.session_kind as enum (
  'strength', 'running', 'cycling_outdoor', 'stationary_bike',
  'treadmill', 'stair_machine', 'walking', 'mobility', 'rest', 'other'
);
create type public.planned_session_status as enum ('planned', 'completed', 'cancelled');
create type public.session_status as enum ('in_progress', 'completed', 'cancelled');
create type public.running_workout_type as enum ('easy', 'long_run', 'tempo', 'intervals', 'recovery', 'other');
create type public.goal_status as enum ('active', 'completed', 'paused', 'cancelled');
create type public.sync_status as enum ('pending', 'success', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  muscle_group text not null check (char_length(muscle_group) between 1 and 80),
  movement_pattern text not null check (char_length(movement_pattern) between 1 and 80),
  equipment text not null check (char_length(equipment) between 1 and 80),
  instructions text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text,
  is_active boolean not null default true,
  estimated_duration_minutes smallint check (estimated_duration_minutes between 1 and 360),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_template_id uuid not null,
  exercise_id uuid not null,
  position smallint not null check (position > 0),
  target_sets smallint not null check (target_sets between 1 and 20),
  target_reps_min smallint not null check (target_reps_min between 1 and 100),
  target_reps_max smallint not null check (target_reps_max between target_reps_min and 100),
  target_rir numeric(3,1) check (target_rir between 0 and 10),
  rest_seconds smallint check (rest_seconds between 0 and 1800),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workout_template_id, position),
  unique (workout_template_id, exercise_id)
);

create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, week_start),
  check (extract(isodow from week_start) = 1)
);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekly_plan_id uuid,
  workout_template_id uuid,
  kind public.session_kind not null,
  title text not null check (char_length(title) between 1 and 120),
  scheduled_date date not null,
  scheduled_time time,
  status public.planned_session_status not null default 'planned',
  target_duration_minutes smallint check (target_duration_minutes between 1 and 1440),
  target_distance_km numeric(7,2) check (target_distance_km > 0),
  target_pace_min_seconds integer check (target_pace_min_seconds > 0),
  target_pace_max_seconds integer check (target_pace_max_seconds >= target_pace_min_seconds),
  target_rpe_min numeric(3,1) check (target_rpe_min between 0 and 10),
  target_rpe_max numeric(3,1) check (target_rpe_max >= target_rpe_min and target_rpe_max <= 10),
  target_talk_test text,
  target_heart_rate_min smallint check (target_heart_rate_min > 0),
  target_heart_rate_max smallint check (target_heart_rate_max >= target_heart_rate_min),
  notes text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.strength_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  planned_session_id uuid,
  workout_template_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_minutes smallint check (duration_minutes between 0 and 1440),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index one_active_strength_session_per_user
on public.strength_sessions(user_id)
where status = 'in_progress';

create table public.strength_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  strength_session_id uuid not null,
  exercise_id uuid not null,
  position smallint not null check (position > 0),
  target_sets smallint check (target_sets between 1 and 20),
  target_reps_min smallint check (target_reps_min between 1 and 100),
  target_reps_max smallint check (target_reps_max >= target_reps_min and target_reps_max <= 100),
  target_rir numeric(3,1) check (target_rir between 0 and 10),
  rest_seconds smallint check (rest_seconds between 0 and 1800),
  feeling smallint check (feeling between 1 and 10),
  has_pain boolean not null default false,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (strength_session_id, position),
  unique (strength_session_id, exercise_id)
);

create table public.strength_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_log_id uuid not null,
  set_number smallint not null check (set_number between 1 and 50),
  weight_kg numeric(7,2) check (weight_kg >= 0),
  reps smallint check (reps between 0 and 500),
  rir numeric(3,1) check (rir between 0 and 10),
  completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (exercise_log_id, set_number)
);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  planned_session_id uuid,
  kind public.session_kind not null check (kind not in ('strength', 'mobility', 'rest')),
  workout_type public.running_workout_type,
  performed_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds > 0),
  distance_km numeric(7,2) check (distance_km > 0),
  average_pace_seconds integer check (average_pace_seconds > 0),
  average_heart_rate smallint check (average_heart_rate > 0),
  max_heart_rate smallint check (max_heart_rate >= average_heart_rate),
  rpe numeric(3,1) check (rpe between 0 and 10),
  talk_test text,
  feeling smallint check (feeling between 1 and 10),
  notes text,
  strava_url text,
  external_source text,
  external_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique nulls not distinct (user_id, external_source, external_id)
);

create table public.mobility_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  estimated_duration_minutes smallint check (estimated_duration_minutes between 1 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

create table public.mobility_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  planned_session_id uuid,
  mobility_routine_id uuid,
  performed_at timestamptz not null,
  duration_minutes smallint check (duration_minutes between 1 and 180),
  completed boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6,2) check (weight_kg > 0),
  body_fat_percent numeric(5,2) check (body_fat_percent between 0 and 100),
  resting_heart_rate smallint check (resting_heart_rate > 0),
  vo2_max numeric(5,2) check (vo2_max > 0),
  steps integer check (steps >= 0),
  active_calories integer check (active_calories >= 0),
  total_calories integer check (total_calories >= active_calories),
  sleep_minutes smallint check (sleep_minutes between 0 and 1440),
  notes text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, measured_on, source)
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null,
  waist_cm numeric(6,2) check (waist_cm > 0),
  chest_cm numeric(6,2) check (chest_cm > 0),
  arm_cm numeric(6,2) check (arm_cm > 0),
  thigh_cm numeric(6,2) check (thigh_cm > 0),
  hip_cm numeric(6,2) check (hip_cm > 0),
  notes text,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, measured_on, source)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  category text not null check (char_length(category) between 1 and 80),
  start_date date not null,
  target_date date,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (target_date is null or target_date >= start_date)
);

create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  status public.sync_status not null default 'pending',
  last_synced_at timestamptz,
  sync_error text,
  attempts smallint not null default 0 check (attempts >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, entity_type, entity_id)
);

alter table public.exercises add constraint exercises_id_user_unique unique (id, user_id);
alter table public.workout_templates add constraint workout_templates_id_user_unique unique (id, user_id);
alter table public.weekly_plans add constraint weekly_plans_id_user_unique unique (id, user_id);
alter table public.planned_sessions add constraint planned_sessions_id_user_unique unique (id, user_id);
alter table public.strength_sessions add constraint strength_sessions_id_user_unique unique (id, user_id);
alter table public.strength_exercise_logs add constraint strength_logs_id_user_unique unique (id, user_id);
alter table public.mobility_routines add constraint mobility_routines_id_user_unique unique (id, user_id);

alter table public.workout_template_exercises
  add constraint template_exercises_template_owner_fk foreign key (workout_template_id, user_id) references public.workout_templates(id, user_id) on delete cascade,
  add constraint template_exercises_exercise_owner_fk foreign key (exercise_id, user_id) references public.exercises(id, user_id) on delete restrict;
alter table public.planned_sessions
  add constraint planned_sessions_week_owner_fk foreign key (weekly_plan_id, user_id) references public.weekly_plans(id, user_id) on delete set null (weekly_plan_id),
  add constraint planned_sessions_template_owner_fk foreign key (workout_template_id, user_id) references public.workout_templates(id, user_id) on delete set null (workout_template_id);
alter table public.strength_sessions
  add constraint strength_sessions_plan_owner_fk foreign key (planned_session_id, user_id) references public.planned_sessions(id, user_id) on delete set null (planned_session_id),
  add constraint strength_sessions_template_owner_fk foreign key (workout_template_id, user_id) references public.workout_templates(id, user_id) on delete set null (workout_template_id);
alter table public.strength_exercise_logs
  add constraint strength_logs_session_owner_fk foreign key (strength_session_id, user_id) references public.strength_sessions(id, user_id) on delete cascade,
  add constraint strength_logs_exercise_owner_fk foreign key (exercise_id, user_id) references public.exercises(id, user_id) on delete restrict;
alter table public.strength_sets
  add constraint strength_sets_log_owner_fk foreign key (exercise_log_id, user_id) references public.strength_exercise_logs(id, user_id) on delete cascade;
alter table public.cardio_sessions
  add constraint cardio_sessions_plan_owner_fk foreign key (planned_session_id, user_id) references public.planned_sessions(id, user_id) on delete set null (planned_session_id);
alter table public.mobility_sessions
  add constraint mobility_sessions_plan_owner_fk foreign key (planned_session_id, user_id) references public.planned_sessions(id, user_id) on delete set null (planned_session_id),
  add constraint mobility_sessions_routine_owner_fk foreign key (mobility_routine_id, user_id) references public.mobility_routines(id, user_id) on delete set null (mobility_routine_id);

create index planned_sessions_user_date_idx on public.planned_sessions(user_id, scheduled_date);
create index strength_sessions_user_started_idx on public.strength_sessions(user_id, started_at desc);
create index strength_logs_exercise_idx on public.strength_exercise_logs(user_id, exercise_id, created_at desc);
create index strength_sets_log_idx on public.strength_sets(exercise_log_id, set_number);
create index cardio_sessions_user_date_idx on public.cardio_sessions(user_id, performed_at desc);
create index health_metrics_user_date_idx on public.health_metrics(user_id, measured_on desc);
create index body_measurements_user_date_idx on public.body_measurements(user_id, measured_on desc);
create index sync_log_pending_idx on public.sync_log(user_id, status) where status <> 'success';

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'exercises', 'workout_templates', 'workout_template_exercises',
    'weekly_plans', 'planned_sessions', 'strength_sessions', 'strength_exercise_logs',
    'strength_sets', 'cardio_sessions', 'mobility_routines', 'mobility_sessions',
    'health_metrics', 'body_measurements', 'goals', 'sync_log'
  ]
  loop
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create or replace function public.owns_template(template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workout_templates
    where id = template_id and user_id = auth.uid()
  );
$$;

create or replace function public.owns_exercise(exercise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.exercises
    where id = exercise_id and user_id = auth.uid()
  );
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'exercises', 'workout_templates', 'workout_template_exercises', 'weekly_plans',
    'planned_sessions', 'strength_sessions', 'strength_exercise_logs', 'strength_sets',
    'cardio_sessions', 'mobility_routines', 'mobility_sessions', 'health_metrics',
    'body_measurements', 'goals', 'sync_log'
  ]
  loop
    execute format('create policy "%1$s_select_own" on public.%1$I for select using (user_id = auth.uid())', table_name);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert with check (user_id = auth.uid())', table_name);
    execute format('create policy "%1$s_update_own" on public.%1$I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete using (user_id = auth.uid())', table_name);
  end loop;
end $$;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.bootstrap_strength_defaults()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  exercise_names text[] := array[
    'Sentadilla', 'Press banca', 'Remo sentado cable', 'Peso muerto rumano con mancuernas',
    'Elevaciones laterales', 'Gemelos', 'Press inclinado mancuernas', 'Prensa inclinada',
    'Jalón al pecho', 'Extensión de cuádriceps', 'Curl femoral', 'Hip thrust',
    'Goblet squat', 'Remo pecho apoyado', 'Curl bíceps', 'Extensión tríceps'
  ];
  muscle_groups text[] := array[
    'Pierna', 'Pecho', 'Espalda', 'Pierna', 'Hombro', 'Pantorrilla', 'Pecho', 'Pierna',
    'Espalda', 'Pierna', 'Pierna', 'Glúteo', 'Pierna', 'Espalda', 'Bíceps', 'Tríceps'
  ];
  patterns text[] := array[
    'Sentadilla', 'Empuje horizontal', 'Tirón horizontal', 'Bisagra de cadera',
    'Abducción de hombro', 'Flexión plantar', 'Empuje inclinado', 'Sentadilla',
    'Tirón vertical', 'Extensión de rodilla', 'Flexión de rodilla', 'Extensión de cadera',
    'Sentadilla', 'Tirón horizontal', 'Flexión de codo', 'Extensión de codo'
  ];
  equipment_names text[] := array[
    'Barra', 'Barra', 'Cable', 'Mancuernas', 'Mancuernas', 'Máquina', 'Mancuernas', 'Máquina',
    'Cable', 'Máquina', 'Máquina', 'Barra', 'Mancuerna', 'Mancuernas', 'Mancuernas', 'Cable'
  ];
  index_number integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id) values (current_user_id) on conflict (id) do nothing;

  for index_number in 1..array_length(exercise_names, 1) loop
    insert into public.exercises (user_id, name, muscle_group, movement_pattern, equipment)
    values (
      current_user_id, exercise_names[index_number], muscle_groups[index_number],
      patterns[index_number], equipment_names[index_number]
    )
    on conflict (user_id, name) do nothing;
  end loop;

  insert into public.workout_templates (user_id, name, estimated_duration_minutes)
  values
    (current_user_id, 'Full Body A', 65),
    (current_user_id, 'Full Body B', 65),
    (current_user_id, 'Full Body C', 65)
  on conflict (user_id, name) do nothing;
end;
$$;

grant execute on function public.bootstrap_strength_defaults() to authenticated;

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
      target_reps_min, target_reps_max, target_rir, rest_seconds
    )
    select current_user_id, new_session_id, exercise_id, position, target_sets,
      target_reps_min, target_reps_max, target_rir, rest_seconds
    from public.workout_template_exercises
    where workout_template_id = template_id and user_id = current_user_id
    order by position
    returning id, target_sets
  )
  insert into public.strength_sets (user_id, exercise_log_id, set_number)
  select current_user_id, inserted_logs.id, series_number
  from inserted_logs cross join lateral generate_series(1, inserted_logs.target_sets) as series_number;

  return new_session_id;
end;
$$;

create or replace function public.finish_strength_session(session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_planned_id uuid;
begin
  update public.strength_sessions
  set status = 'completed', completed_at = timezone('utc', now()),
      duration_minutes = greatest(0, floor(extract(epoch from (timezone('utc', now()) - started_at)) / 60)::smallint)
  where id = session_id and user_id = auth.uid() and status = 'in_progress'
  returning planned_session_id into linked_planned_id;

  if not found then raise exception 'Active session not found'; end if;
  if linked_planned_id is not null then
    update public.planned_sessions
    set status = 'completed', completed_at = timezone('utc', now())
    where id = linked_planned_id and user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.start_strength_session(uuid, uuid) to authenticated;
grant execute on function public.finish_strength_session(uuid) to authenticated;
