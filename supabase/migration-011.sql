-- Migration 011: let the app write an audit entry when someone exports sensitive data (backup, list for the HR app).
-- Fresh install? Skip this file — it is already at the end of schema.sql.
create or replace function public.log_export(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Not allowed'; end if;
  perform public.log_audit('export', jsonb_build_object('kind', left(coalesce(p_kind, ''), 40)));
end $$;
revoke execute on function public.log_export(text) from public, anon;
grant execute on function public.log_export(text) to authenticated;
