alter table public.cardio_sessions
  drop constraint if exists cardio_sessions_user_id_external_source_external_id_key;

create unique index if not exists cardio_sessions_external_identity_unique
  on public.cardio_sessions (user_id, external_source, external_id)
  where external_source is not null and external_id is not null;
