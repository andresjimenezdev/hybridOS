create or replace function public.finish_strength_session(session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_planned_id uuid;
  current_status text;
begin
  update public.strength_sessions
  set status = 'completed',
      completed_at = timezone('utc', now()),
      duration_minutes = least(
        1440,
        greatest(
          0,
          floor(extract(epoch from (timezone('utc', now()) - started_at)) / 60)::integer
        )
      )::smallint
  where id = session_id
    and user_id = auth.uid()
    and status = 'in_progress'
  returning planned_session_id into linked_planned_id;

  if found then
    if linked_planned_id is not null then
      update public.planned_sessions
      set status = 'completed', completed_at = timezone('utc', now())
      where id = linked_planned_id and user_id = auth.uid();
    end if;
    return;
  end if;

  select status::text into current_status
  from public.strength_sessions
  where id = session_id and user_id = auth.uid();

  if not found then
    raise exception 'Strength session not found';
  end if;

  if current_status = 'completed' then
    return;
  end if;

  raise exception 'Strength session is not active';
end;
$$;

grant execute on function public.finish_strength_session(uuid) to authenticated;
