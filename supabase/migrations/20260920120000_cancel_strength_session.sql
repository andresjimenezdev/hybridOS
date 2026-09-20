create or replace function public.cancel_strength_session(target_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_planned_session_id uuid;
begin
  delete from public.strength_sessions
  where id = target_session_id
    and user_id = auth.uid()
    and status = 'in_progress'
  returning planned_session_id into linked_planned_session_id;

  if not found then
    raise exception 'Active strength session not found';
  end if;

  if linked_planned_session_id is not null then
    update public.planned_sessions
    set status = 'planned',
        completed_at = null,
        cancelled_at = null
    where id = linked_planned_session_id
      and user_id = auth.uid()
      and status = 'in_progress';
  end if;
end;
$$;

grant execute on function public.cancel_strength_session(uuid) to authenticated;
