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
