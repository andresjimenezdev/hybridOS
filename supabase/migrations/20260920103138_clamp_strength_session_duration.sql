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

  if not found then
    raise exception 'Active session not found';
  end if;

  if linked_planned_id is not null then
    update public.planned_sessions
    set status = 'completed', completed_at = timezone('utc', now())
    where id = linked_planned_id and user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.finish_strength_session(uuid) to authenticated;
