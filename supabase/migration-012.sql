-- Migration 012: a tiny public "ping" so the keep-alive job can run a real (harmless) database query.
-- Fresh install? Skip this file — it is already at the end of schema.sql.
-- It returns only the current time: no data, no secrets.
create or replace function public.ping() returns timestamptz
language sql stable as $$ select now() $$;
grant execute on function public.ping() to anon, authenticated;
