-- My City shared multiplayer activity feed
-- Run this ONCE in your My City project's Supabase SQL Editor.
-- Safe to re-run; leaves the existing game tables and turn logic intact.
-- Activity records are written by DB triggers, NOT by untrusted clients.

create table if not exists public.mc_activity_log (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.mc_rooms(id) on delete cascade,
  player_name text not null,
  activity text not null,
  created_at timestamptz not null default now()
);
create index if not exists mc_activity_log_latest
  on public.mc_activity_log(room_id, id desc);

alter table public.mc_activity_log enable row level security;
revoke all on public.mc_activity_log from public, anon, authenticated;
-- No RLS policies: the log is available ONLY via membership-verified RPC.

create or replace function public.mc_space_label(p_space integer)
returns text language sql immutable set search_path = '' as $$
  select case p_space
    when 0 then 'GO'
    when 1 then 'Bowling Avenue'
    when 2 then 'Community Chest'
    when 3 then 'Green Street'
    when 4 then 'Income Tax'
    when 5 then 'Car Shop #1'
    when 6 then 'Campbell Rd'
    when 7 then 'Chance'
    when 8 then 'Robbins Dr'
    when 9 then 'Packard Rd'
    when 10 then 'Jail / Just Visiting'
    when 11 then 'Devon Park'
    when 12 then 'Utility Bill'
    when 13 then 'Westview Park'
    when 14 then 'Peninsular Place'
    when 15 then 'Car Shop #2'
    when 16 then 'East Medical Dr'
    when 17 then 'Community Chest'
    when 18 then 'Fuller Rd'
    when 19 then 'West Medical Dr'
    when 20 then 'Casino'
    when 21 then 'St. Marys'
    when 22 then 'Chance'
    when 23 then 'Basil Rd'
    when 24 then 'Snowden'
    when 25 then 'Car Shop #3'
    when 26 then 'Warren E Bow'
    when 27 then 'Ludington Magnet'
    when 28 then 'Utility Bill'
    when 29 then 'University'
    when 30 then 'Go To Jail'
    when 31 then 'Pembroke Ave'
    when 32 then 'Greenfield Rd'
    when 33 then 'Community Chest'
    when 34 then '7 Mile'
    when 35 then 'Car Shop #4'
    when 36 then 'Chance'
    when 37 then 'Marlowe'
    when 38 then 'Luxury Tax'
    when 39 then 'Coyle'
    else 'Unknown space'
  end;
$$;

-- Secure retrieval of the 5 most recent events, displayed oldest-to-newest.
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

-- Player joins (including when the host creates the room).
create or replace function public.mc_activity_member_join()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mc_activity_log(room_id,player_name,activity)
  values(
    new.room_id,
    new.display_name,
    case when new.seat=0 then 'created the room' else 'joined the room' end
  );
  return new;
end;
$$;
drop trigger if exists mc_activity_member_join_trigger on public.mc_members;
create trigger mc_activity_member_join_trigger
  after insert on public.mc_members
  for each row execute function public.mc_activity_member_join();

-- Money changes are logged as transactions; the total balance stays private.
create or replace function public.mc_activity_money_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_difference integer;
begin
  v_difference:=new.cash-old.cash;
  if v_difference<>0 then
    insert into public.mc_activity_log(room_id,player_name,activity)
    values(
      new.room_id,
      new.display_name,
      case when v_difference>0
        then 'received $'||v_difference::text
        else 'paid $'||(-v_difference)::text
      end
    );
  end if;
  return new;
end;
$$;
drop trigger if exists mc_activity_money_change_trigger on public.mc_members;
create trigger mc_activity_money_change_trigger
  after update of cash on public.mc_members
  for each row
  when (old.cash is distinct from new.cash)
  execute function public.mc_activity_money_change();

-- Buying a property logs the exact property purchase.
create or replace function public.mc_activity_property_bought()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  select m.display_name into v_name from public.mc_members m
    where m.room_id=new.room_id and m.user_id=new.owner_user_id;
  if v_name is not null then
    insert into public.mc_activity_log(room_id,player_name,activity)
    values(
      new.room_id,
      v_name,
      'bought '||public.mc_space_label(new.space)||
        ' for $'||public.mc_space_price(new.space)::text
    );
  end if;
  return new;
end;
$$;
drop trigger if exists mc_activity_property_bought_trigger on public.mc_owned_properties;
create trigger mc_activity_property_bought_trigger
  after insert on public.mc_owned_properties
  for each row execute function public.mc_activity_property_bought();

-- Host start, dice rolls, property pass and end-turn actions.
create or replace function public.mc_activity_room_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_activity text;
begin
  v_activity:=null;

  if old.status='lobby' and new.status='playing' then
    select m.display_name into v_name from public.mc_members m
      where m.room_id=new.id and m.user_id=new.host_user_id;
    v_activity:='started the game';

  elsif new.roll_seq>old.roll_seq then
    select m.display_name into v_name from public.mc_members m
      where m.room_id=new.id and m.seat=new.last_roll_seat;
    v_activity:='rolled '||new.dice_a::text||' + '||new.dice_b::text||
      ' and landed on '||public.mc_space_label(new.last_roll_to);

  elsif old.phase='roll' and new.phase='end'
    and new.roll_seq=old.roll_seq
    and new.dice_a=0 and new.dice_b=0 then
    select m.display_name into v_name from public.mc_members m
      where m.room_id=new.id and m.seat=old.turn_seat;
    v_activity:='missed a turn in Jail';

  elsif old.phase='decision' and new.phase='end' and old.pending_space is not null then
    -- A purchase inserts the ownership row BEFORE ending the decision phase.
    -- Don't misreport successful purchases as passes.
    if not exists(
      select 1 from public.mc_owned_properties p
      where p.room_id=new.id and p.space=old.pending_space
    ) then
      select m.display_name into v_name from public.mc_members m
        where m.room_id=new.id and m.seat=old.turn_seat;
      v_activity:='passed on '||public.mc_space_label(old.pending_space);
    end if;

  elsif old.phase='end' and new.phase='roll'
    and old.turn_seat is distinct from new.turn_seat then
    select m.display_name into v_name from public.mc_members m
      where m.room_id=new.id and m.seat=old.turn_seat;
    v_activity:='ended their turn';
  end if;

  if v_name is not null and v_activity is not null then
    insert into public.mc_activity_log(room_id,player_name,activity)
    values(new.id,v_name,v_activity);
  end if;
  return new;
end;
$$;
drop trigger if exists mc_activity_room_changed_trigger on public.mc_rooms;
create trigger mc_activity_room_changed_trigger
  after update on public.mc_rooms
  for each row execute function public.mc_activity_room_changed();

-- Security: guests cannot fabricate activity by calling these directly.
revoke all on function public.mc_space_label(integer) from public, anon, authenticated;
revoke all on function public.mc_recent_activity(text) from public, anon;
revoke all on function public.mc_activity_member_join() from public, anon, authenticated;
revoke all on function public.mc_activity_money_change() from public, anon, authenticated;
revoke all on function public.mc_activity_property_bought() from public, anon, authenticated;
revoke all on function public.mc_activity_room_changed() from public, anon, authenticated;
grant execute on function public.mc_recent_activity(text) to authenticated;
