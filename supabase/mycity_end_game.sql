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
