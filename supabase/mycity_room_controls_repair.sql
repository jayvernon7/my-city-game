-- MY CITY ROOM CONTROLS REPAIR
-- Run this complete script in the Supabase SQL Editor of the
-- My City project (not The NBA League).
-- Creates/repairs BOTH the host End Game and lobby Cancel/Leave RPCs.
-- Does NOT delete active rooms or games by merely running this script.

-- ==== supabase/mycity_cancel_room.sql ====
-- MY CITY: enable exiting the lobby or cancelling a mistaken room.
-- Run this once in My City's Supabase SQL Editor.
-- Does not modify existing matches or The NBA League.
create or replace function public.mc_exit_room(p_code text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_room public.mc_rooms%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in first';
  end if;
  select * into v_room
  from public.mc_rooms
  where code=pg_catalog.upper(pg_catalog.btrim(p_code))
  for update;
  if not found then raise exception 'Room does not exist'; end if;
  if not exists(
    select 1 from public.mc_members
    where room_id=v_room.id and user_id=v_user
  ) then raise exception 'You are not a member of this room'; end if;
  if v_room.status<>'lobby' then
    raise exception 'Room already started; a running match cannot be cancelled here';
  end if;

  if v_room.host_user_id=v_user then
    -- Host can cancel a waiting room and its membership atomically.
    delete from public.mc_rooms where id=v_room.id;
  else
    -- Guests leave without affecting host or other members.
    delete from public.mc_members
     where room_id=v_room.id and user_id=v_user;
    update public.mc_rooms
      set updated_at=now()
      where id=v_room.id;
  end if;
end
$$;

revoke execute on function public.mc_exit_room(text) from public, anon;
grant execute on function public.mc_exit_room(text) to authenticated;


-- ==== supabase/mycity_end_game.sql ====
-- My City multiplayer: host-only End Game
-- Run in the My City Supabase SQL Editor (once).
-- This does NOT delete a room, member balances, properties, or history.
-- Other players can still view the final board, but nobody can take turns.

create or replace function public.mc_end_game(p_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.mc_rooms%rowtype;
  v_host_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select * into v_room
  from public.mc_rooms
  where code=pg_catalog.upper(pg_catalog.btrim(p_code))
  for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_user_id is distinct from auth.uid() then
    raise exception 'Only the host can end the game';
  end if;
  if v_room.status<>'playing' then
    raise exception 'Only a game in progress can be ended';
  end if;

  update public.mc_rooms
  set status='finished',
      phase='end',
      pending_space=null,
      updated_at=now()
  where id=v_room.id;

  select display_name into v_host_name
  from public.mc_members
  where room_id=v_room.id and user_id=auth.uid();

  -- The shared log is optional until the activity-log migration is enabled.
  if pg_catalog.to_regclass('public.mc_activity_log') is not null then
    insert into public.mc_activity_log(room_id,player_name,activity)
    values(v_room.id,coalesce(v_host_name,'Host'),'ended the game');
  end if;
end
$$;

revoke execute on function public.mc_end_game(text) from public, anon;
grant execute on function public.mc_end_game(text) to authenticated;


-- Ask PostgREST to re-read the RPC signatures immediately.
notify pgrst, 'reload schema';

-- Confirm the functions exist with the exact argument names the
-- website sends: p_code (NOT p-code).
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('mc_exit_room','mc_end_game')
order by p.proname;
