-- My City: selectable male/female characters in multiplayer.
-- Run ONCE in the My City Supabase SQL Editor.
alter table public.mc_members
  add column if not exists piece text not null default 'male'
  check (piece in ('male','female'));

-- Allow existing players to pick a character only while waiting in lobby.
create or replace function public.mc_set_piece(p_code text,p_piece text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_room public.mc_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_piece not in ('male','female') then raise exception 'Invalid piece'; end if;
  select * into v_room from public.mc_rooms
  where code=upper(btrim(p_code)) for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.status<>'lobby' then raise exception 'Piece selection closes when the game starts'; end if;
  update public.mc_members set piece=p_piece
  where room_id=v_room.id and user_id=auth.uid();
  if not found then raise exception 'Join the room before choosing a piece'; end if;
end $$;

revoke execute on function public.mc_set_piece(text,text) from public,anon;
grant execute on function public.mc_set_piece(text,text) to authenticated;

-- Keep the existing room-state contract, adding piece information for all
-- joined players. Other players' balances/properties stay private.
create or replace function public.mc_room_state(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.mc_rooms%rowtype;
  v_me public.mc_members%rowtype;
  v_players jsonb;
  v_properties jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v_room from public.mc_rooms
    where code=upper(btrim(p_code));
  if not found then raise exception 'Room not found'; end if;
  select * into v_me from public.mc_members
    where room_id=v_room.id and user_id=auth.uid();
  if not found then raise exception 'You are not a member of this room'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seat',m.seat,'name',m.display_name,'at',m.position,
    'bankrupt',m.bankrupt,'jailed',m.jailed>0,'piece',m.piece
  ) order by m.seat),'[]'::jsonb)
  into v_players from public.mc_members m where m.room_id=v_room.id;
  select coalesce(jsonb_agg(p.space order by p.space),'[]'::jsonb)
  into v_properties from public.mc_owned_properties p
  where p.room_id=v_room.id and p.owner_user_id=auth.uid();
  return jsonb_build_object(
    'room',jsonb_build_object(
      'code',v_room.code,'max_players',v_room.max_players,
      'status',v_room.status,'phase',v_room.phase,
      'turn_seat',v_room.turn_seat,'round',v_room.round_number,
      'pending_space',case when v_me.seat=v_room.turn_seat
        then v_room.pending_space else null end,
      'dice',jsonb_build_array(v_room.dice_a,v_room.dice_b),
      'roll_seq',v_room.roll_seq,
      'last_roll',case when v_room.roll_seq>0 then
        jsonb_build_object('seat',v_room.last_roll_seat,'from',v_room.last_roll_from,
          'to',v_room.last_roll_to,'a',v_room.dice_a,'b',v_room.dice_b)
        else null end
    ),
    'players',v_players,
    'me',jsonb_build_object(
      'seat',v_me.seat,'name',v_me.display_name,'cash',v_me.cash,
      'at',v_me.position,'bankrupt',v_me.bankrupt,
      'host',v_room.host_user_id=auth.uid(),'properties',v_properties,'piece',v_me.piece
    )
  );
end $$;
notify pgrst,'reload schema';
