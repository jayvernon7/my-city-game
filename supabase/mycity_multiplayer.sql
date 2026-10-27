-- MY CITY multiplayer (Supabase Postgres)
-- Run once in Supabase SQL Editor; does not modify The NBA League tables.
-- Anonymous Supabase Auth must be enabled for no-password player sessions.
-- All data is private: ONLY these membership-checked RPCs are callable.
-- Server-side turns, dice, purchases, rent and balances are authoritative.

create table if not exists public.mc_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{8}$'),
  host_user_id uuid not null references auth.users(id),
  max_players integer not null check (max_players between 2 and 4),
  status text not null default 'lobby' check (status in ('lobby','playing','finished')),
  phase text not null default 'roll' check (phase in ('roll','decision','end')),
  turn_seat integer not null default 0,
  round_number integer not null default 1,
  pending_space integer check (pending_space between 0 and 39),
  dice_a integer,
  dice_b integer,
  roll_seq integer not null default 0,
  last_roll_seat integer,
  last_roll_from integer,
  last_roll_to integer,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.mc_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.mc_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name text not null,
  seat integer not null check (seat between 0 and 3),
  position integer not null default 0 check (position between 0 and 39),
  cash integer not null default 1500 check (cash >= 0),
  jailed integer not null default 0 check (jailed between 0 and 9),
  bankrupt boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id,user_id), unique (room_id,seat)
);
create unique index if not exists mc_unique_room_display_name
  on public.mc_members(room_id,lower(display_name));

create table if not exists public.mc_owned_properties (
  room_id uuid not null references public.mc_rooms(id) on delete cascade,
  space integer not null check (space between 0 and 39),
  owner_user_id uuid not null references auth.users(id),
  primary key(room_id,space)
);
create index if not exists mc_owned_properties_owner
  on public.mc_owned_properties(room_id,owner_user_id);

alter table public.mc_rooms enable row level security;
alter table public.mc_members enable row level security;
alter table public.mc_owned_properties enable row level security;
-- No direct table policies: every read and mutation uses vetted RPCs.
revoke all on public.mc_rooms, public.mc_members, public.mc_owned_properties
  from anon, authenticated;

-- Return official purchase prices by space index. Not every square is buyable.
create or replace function public.mc_space_price(p_space integer)
returns integer language sql immutable set search_path = '' as $$
  select case p_space
    when 1 then 60 when 3 then 60
    when 5 then 200 when 6 then 100 when 8 then 100 when 9 then 120
    when 11 then 140 when 12 then 150 when 13 then 140 when 14 then 160
    when 15 then 200 when 16 then 180 when 18 then 180 when 19 then 200
    when 21 then 220 when 23 then 220 when 24 then 240
    when 25 then 200 when 26 then 260 when 27 then 260 when 28 then 150
    when 29 then 280 when 31 then 300 when 32 then 300 when 34 then 320
    when 35 then 200 when 37 then 350 when 39 then 400
    else null
  end;
$$;

-- A group name is needed for the same full-color-set rent bonus as solo.
create or replace function public.mc_color_group(p_space integer)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_space in (1,3) then 1
    when p_space in (6,8,9) then 2
    when p_space in (11,13,14) then 3
    when p_space in (16,18,19) then 4
    when p_space in (21,23,24) then 5
    when p_space in (26,27,29) then 6
    when p_space in (31,32,34) then 7
    when p_space in (37,39) then 8
    else null
  end;
$$;

create or replace function public.mc_create_room(
  p_name text, p_max_players integer default 4
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_name);
  v_code text;
  v_room uuid;
  v_attempt integer;
begin
  if v_uid is null then raise exception 'Sign in to create a room'; end if;
  if pg_catalog.length(v_name) not between 1 and 24 or v_name ~ '[[:cntrl:]]'
    then raise exception 'Player name must be 1 to 24 characters'; end if;
  if p_max_players not between 2 and 4
    then raise exception 'Room size must be between 2 and 4 players'; end if;
  for v_attempt in 1..8 loop
    v_code := pg_catalog.upper(pg_catalog.substr(
      pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8
    ));
    begin
      insert into public.mc_rooms(code,host_user_id,max_players)
        values (v_code,v_uid,p_max_players)
        returning id into v_room;
      exit;
    exception when unique_violation then
      v_room := null;
    end;
  end loop;
  if v_room is null then raise exception 'Could not create room; retry'; end if;
  insert into public.mc_members(room_id,user_id,display_name,seat)
    values(v_room,v_uid,v_name,0);
  return v_code;
end $$;

create or replace function public.mc_join_room(p_code text,p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_room public.mc_rooms%rowtype;
  v_name text := pg_catalog.btrim(p_name);
  v_seat integer;
begin
  if v_uid is null then raise exception 'Sign in to join a room'; end if;
  if pg_catalog.length(v_name) not between 1 and 24 or v_name ~ '[[:cntrl:]]'
    then raise exception 'Player name must be 1 to 24 characters'; end if;
  select * into v_room from public.mc_rooms
   where code=pg_catalog.upper(pg_catalog.btrim(p_code))
   for update;
  if not found then raise exception 'Room code not found'; end if;
  if exists(select 1 from public.mc_members
            where room_id=v_room.id and user_id=v_uid) then
    return v_room.code;
  end if;
  if v_room.status<>'lobby' then raise exception 'Game has already started'; end if;
  if (select count(*) from public.mc_members where room_id=v_room.id)>=v_room.max_players
    then raise exception 'Room is full'; end if;
  if exists(select 1 from public.mc_members where room_id=v_room.id
            and pg_catalog.lower(display_name)=pg_catalog.lower(v_name))
    then raise exception 'This player name is already in use'; end if;
  select pg_catalog.min(available.seat) into v_seat
    from pg_catalog.generate_series(0,v_room.max_players-1) as available(seat)
    where not exists (select 1 from public.mc_members as m
                      where m.room_id=v_room.id and m.seat=available.seat);
  if v_seat is null then raise exception 'Room is full'; end if;
  insert into public.mc_members(room_id,user_id,display_name,seat)
    values(v_room.id,v_uid,v_name,v_seat);
  update public.mc_rooms set updated_at=now() where id=v_room.id;
  return v_room.code;
end $$;

create or replace function public.mc_start_room(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_room public.mc_rooms%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v_room from public.mc_rooms
    where code=pg_catalog.upper(pg_catalog.btrim(p_code)) for update;
  if not found then raise exception 'Room not found'; end if;
  if v_room.host_user_id<>auth.uid() then raise exception 'Only the host can start'; end if;
  if v_room.status<>'lobby' then raise exception 'Game already started'; end if;
  if (select count(*) from public.mc_members where room_id=v_room.id)<2
    then raise exception 'At least two people must join'; end if;
  update public.mc_rooms set status='playing', phase='roll',
    turn_seat=0,round_number=1,pending_space=null,updated_at=now()
    where id=v_room.id;
end $$;

-- The RPC deliberately reveals ONLY the caller's money and portfolio.
-- Names, locations and the current turn are public to room members.
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
    where code=pg_catalog.upper(pg_catalog.btrim(p_code));
  if not found then raise exception 'Room not found'; end if;
  select * into v_me from public.mc_members
    where room_id=v_room.id and user_id=auth.uid();
  if not found then raise exception 'You are not a member of this room'; end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'seat',m.seat,'name',m.display_name,'at',m.position,
      'bankrupt',m.bankrupt,'jailed',m.jailed>0
    ) order by m.seat
  ),'[]'::jsonb) into v_players
  from public.mc_members m where m.room_id=v_room.id;
  select coalesce(pg_catalog.jsonb_agg(p.space order by p.space),'[]'::jsonb)
    into v_properties
  from public.mc_owned_properties p
  where p.room_id=v_room.id and p.owner_user_id=auth.uid();
  return pg_catalog.jsonb_build_object(
    'room',pg_catalog.jsonb_build_object(
      'code',v_room.code,'max_players',v_room.max_players,
      'status',v_room.status,'phase',v_room.phase,
      'turn_seat',v_room.turn_seat,'round',v_room.round_number,
      'pending_space',case when v_me.seat=v_room.turn_seat
                      then v_room.pending_space else null end,
      'dice',pg_catalog.jsonb_build_array(v_room.dice_a,v_room.dice_b),
      'roll_seq',v_room.roll_seq,
      'last_roll',case when v_room.roll_seq>0 then
        pg_catalog.jsonb_build_object(
          'seat',v_room.last_roll_seat,'from',v_room.last_roll_from,
          'to',v_room.last_roll_to,
          'a',v_room.dice_a,'b',v_room.dice_b
        ) else null end
    ),
    'players',v_players,
    'me',pg_catalog.jsonb_build_object(
      'seat',v_me.seat,'name',v_me.display_name,'cash',v_me.cash,
      'at',v_me.position,'bankrupt',v_me.bankrupt,
      'host',v_room.host_user_id=auth.uid(),'properties',v_properties
    )
  );
end $$;

-- Actions are executed as a single serialized transaction on the locked
-- room row. Clients can never choose the dice or edit their balances.
create or replace function public.mc_take_action(p_code text,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.mc_rooms%rowtype;
  v_me public.mc_members%rowtype;
  v_uid uuid := auth.uid();
  v_a integer;
  v_b integer;
  v_steps integer;
  v_from integer;
  v_to integer;
  v_price integer;
  v_owner uuid;
  v_due integer := 0;
  v_payment integer := 0;
  v_kind integer;
  v_count integer;
  v_group integer;
  v_group_size integer;
  v_owned_count integer;
  v_pending integer;
  v_phase text := 'end';
  v_next integer;
  v_winner_count integer;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if p_action not in ('roll','buy','pass','end') then
    raise exception 'Unknown action'; end if;
  select * into v_room from public.mc_rooms
    where code=pg_catalog.upper(pg_catalog.btrim(p_code)) for update;
  if not found then raise exception 'Room not found'; end if;
  select * into v_me from public.mc_members
    where room_id=v_room.id and user_id=v_uid for update;
  if not found then raise exception 'Not a member of this room'; end if;
  if v_room.status<>'playing' then raise exception 'Game is not active'; end if;
  if v_room.turn_seat<>v_me.seat then
    raise exception 'It is not your turn'; end if;
  if v_me.bankrupt then raise exception 'You are out of the game'; end if;

  if p_action='roll' then
    if v_room.phase<>'roll' then raise exception 'You already rolled this turn'; end if;
    v_from:=v_me.position;
    if v_me.jailed>0 then
      update public.mc_members set jailed=jailed-1 where id=v_me.id;
      update public.mc_rooms set phase='end',dice_a=0,dice_b=0,
        pending_space=null,updated_at=now() where id=v_room.id;
      return public.mc_room_state(p_code);
    end if;
    v_a:=pg_catalog.floor(pg_catalog.random()*6)::integer+1;
    v_b:=pg_catalog.floor(pg_catalog.random()*6)::integer+1;
    v_steps:=v_a+v_b;
    v_to:=(v_from+v_steps)%40;
    update public.mc_members set position=v_to where id=v_me.id;
    if v_from+v_steps>=40 then
      update public.mc_members set cash=cash+200 where id=v_me.id;
    end if;
    v_pending:=null;
    v_phase:='end';

    if v_to=30 then
      -- Go To Jail: move directly to Jail; skip the next turn.
      v_to:=10;
      update public.mc_members set position=10,jailed=1 where id=v_me.id;
    elsif v_to in (4,38) then
      v_due:=case when v_to=4 then 200 else 100 end;
      update public.mc_members set cash=greatest(0,cash-v_due) where id=v_me.id;
    elsif v_to=20 then
      if pg_catalog.random()<.5 then
        update public.mc_members set cash=cash+125 where id=v_me.id;
      else
        update public.mc_members set cash=greatest(0,cash-75) where id=v_me.id;
      end if;
    elsif v_to in (2,17,33) then
      -- Same five sample Community Chest outcomes as solo mode.
      v_count:=pg_catalog.floor(pg_catalog.random()*5)::integer;
      v_due:=(array[100,-50,50,-75,25])[v_count+1];
      update public.mc_members set cash=greatest(0,cash+v_due) where id=v_me.id;
    elsif v_to in (7,22,36) then
      -- Same five sample Chance outcomes as solo mode.
      v_count:=pg_catalog.floor(pg_catalog.random()*5)::integer;
      v_due:=(array[-100,150,-50,75,100])[v_count+1];
      update public.mc_members set cash=greatest(0,cash+v_due) where id=v_me.id;
    else
      v_price:=public.mc_space_price(v_to);
      if v_price is not null then
        select owner_user_id into v_owner from public.mc_owned_properties
          where room_id=v_room.id and space=v_to;
        if v_owner is null then
          if (select cash from public.mc_members where id=v_me.id)>=v_price then
            v_pending:=v_to;v_phase:='decision';
          end if;
        elsif v_owner<>v_uid then
          if v_to in (5,15,25,35) then
            select count(*) into v_count from public.mc_owned_properties
              where room_id=v_room.id and owner_user_id=v_owner
                and space in (5,15,25,35);
            v_due:=25*pg_catalog.power(2,v_count-1)::integer;
          elsif v_to in (12,28) then
            select count(*) into v_count from public.mc_owned_properties
              where room_id=v_room.id and owner_user_id=v_owner
                and space in (12,28);
            v_due:=v_steps*(case when v_count=2 then 10 else 4 end);
          else
            v_due:=greatest(2,pg_catalog.round(v_price*.12)::integer);
            v_group:=public.mc_color_group(v_to);
            select count(*) into v_group_size from
              pg_catalog.generate_series(0,39) as a(i)
              where public.mc_color_group(a.i)=v_group;
            select count(*) into v_owned_count from public.mc_owned_properties op
              where op.room_id=v_room.id and op.owner_user_id=v_owner
                and public.mc_color_group(op.space)=v_group;
            if v_group_size>0 and v_group_size=v_owned_count then
              v_due:=v_due*2;
            end if;
          end if;
          select cash into v_payment from public.mc_members where id=v_me.id;
          v_payment:=least(v_due,v_payment);
          update public.mc_members set cash=cash-v_payment where id=v_me.id;
          update public.mc_members set cash=cash+v_payment
            where room_id=v_room.id and user_id=v_owner;
          if v_payment<v_due then
            update public.mc_members set bankrupt=true where id=v_me.id;
            delete from public.mc_owned_properties
              where room_id=v_room.id and owner_user_id=v_uid;
          end if;
        end if;
      end if;
    end if;
    update public.mc_rooms set
      phase=v_phase,pending_space=v_pending,
      dice_a=v_a,dice_b=v_b,roll_seq=roll_seq+1,
      last_roll_seat=v_me.seat,last_roll_from=v_from,last_roll_to=v_to,
      updated_at=now()
      where id=v_room.id;
    select count(*) into v_winner_count from public.mc_members
       where room_id=v_room.id and not bankrupt;
    if v_winner_count<=1 then
      update public.mc_rooms set status='finished',phase='end',pending_space=null
        where id=v_room.id;
    end if;

  elsif p_action='buy' then
    if v_room.phase<>'decision' or v_room.pending_space is null then
      raise exception 'No property is available to buy'; end if;
    v_price:=public.mc_space_price(v_room.pending_space);
    if v_price is null or v_me.cash<v_price then
      raise exception 'Insufficient balance to buy property'; end if;
    insert into public.mc_owned_properties(room_id,space,owner_user_id)
       values(v_room.id,v_room.pending_space,v_uid);
    update public.mc_members set cash=cash-v_price where id=v_me.id;
    update public.mc_rooms set phase='end',pending_space=null,updated_at=now()
      where id=v_room.id;

  elsif p_action='pass' then
    if v_room.phase<>'decision' then raise exception 'Nothing to pass'; end if;
    update public.mc_rooms set phase='end',pending_space=null,updated_at=now()
      where id=v_room.id;

  elsif p_action='end' then
    if v_room.phase<>'end' then
      raise exception 'Finish your turn before ending'; end if;
    select seat into v_next from public.mc_members
      where room_id=v_room.id and seat>v_room.turn_seat and not bankrupt
      order by seat limit 1;
    if v_next is null then
      select seat into v_next from public.mc_members
        where room_id=v_room.id and not bankrupt order by seat limit 1;
    end if;
    if v_next is null then raise exception 'No active players'; end if;
    update public.mc_rooms set turn_seat=v_next,
      round_number=round_number+(case when v_next<=v_room.turn_seat then 1 else 0 end),
      phase='roll',pending_space=null,updated_at=now()
      where id=v_room.id;
  end if;

  return public.mc_room_state(p_code);
end $$;

-- No direct table reads for clients, including other room members.
-- The RPCs expose only membership-authorized, minimum necessary fields.
revoke execute on function public.mc_space_price(integer) from public,anon;
revoke execute on function public.mc_color_group(integer) from public,anon;
revoke execute on function public.mc_create_room(text,integer) from public,anon;
revoke execute on function public.mc_join_room(text,text) from public,anon;
revoke execute on function public.mc_start_room(text) from public,anon;
revoke execute on function public.mc_room_state(text) from public,anon;
revoke execute on function public.mc_take_action(text,text) from public,anon;

grant execute on function public.mc_create_room(text,integer) to authenticated;
grant execute on function public.mc_join_room(text,text) to authenticated;
grant execute on function public.mc_start_room(text) to authenticated;
grant execute on function public.mc_room_state(text) to authenticated;
grant execute on function public.mc_take_action(text,text) to authenticated;
