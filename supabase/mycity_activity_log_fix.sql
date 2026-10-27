-- My City activity log repair: paste this ENTIRE file into the My City
-- Supabase SQL Editor and click Run.
-- Replaces only mc_recent_activity; does not delete logs or rooms.
-- Fixes the pg_catalog.coalesce runtime error in the original version.

create or replace function public.mc_recent_activity(p_code text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
  v_logs jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select r.id into v_room_id
    from public.mc_rooms r
    join public.mc_members m on m.room_id=r.id
    where r.code=pg_catalog.upper(pg_catalog.btrim(p_code))
      and m.user_id=auth.uid();
  if v_room_id is null then
    raise exception 'Not a member of this room';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',a.id,'name',a.player_name,'activity',a.activity
      ) order by a.id asc
    ),
    '[]'::jsonb
  ) into v_logs from (
    select id,player_name,activity
      from public.mc_activity_log
      where room_id=v_room_id
      order by id desc
      limit 5
  ) a;
  return v_logs;
end;
$$;


revoke execute on function public.mc_recent_activity(text) from public, anon;
grant execute on function public.mc_recent_activity(text) to authenticated;
