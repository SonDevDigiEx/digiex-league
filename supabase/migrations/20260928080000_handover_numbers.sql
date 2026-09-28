-- Chairman handover + jersey numbers.
-- * handover_chair: the chairman passes the role to someone in their team (a player with an account, or the team's BHL);
--   the outgoing chairman becomes a regular member (and stays a player).
-- * Jersey numbers are 0–999 and unique across the league (checked whenever a number is set or changed;
--   numbers already duplicated are left alone until someone changes them). Players set their own via set_my_number.

alter table public.players drop constraint if exists players_num_check;
alter table public.players add constraint players_num_check check (num between 0 and 999);

-- Lowest unused number from 1 (0 only if everything else is taken).
create or replace function public.next_free_num() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select n from generate_series(1, 999) n where not exists (select 1 from public.players where num = n) order by n limit 1), 0)
$$;

create or replace function public.check_unique_num() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' or new.num is distinct from old.num then
    select name into who from public.players where num = new.num and id <> new.id limit 1;
    if who is not null then raise exception 'Số áo % đã có người dùng (%). Chọn số khác.', new.num, who; end if;
  end if;
  return new;
end $$;

drop trigger if exists players_unique_num on public.players;
create trigger players_unique_num before insert or update of num on public.players
  for each row execute function public.check_unique_num();

-- A player changes their own number.
create or replace function public.set_my_number(p_num int) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  if p_num is null or p_num not between 0 and 999 then raise exception 'Số áo phải từ 0 đến 999.'; end if;
  update public.players set num = p_num where id = p.id;
end $$;

-- The chairman hands the role to a player (with an account) or the BHL of the same team.
create or replace function public.handover_chair(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  tgt public.profiles;
  t text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.role is distinct from 'chair' or me.team_id is null then raise exception 'Chỉ Chủ tịch đội được bàn giao.'; end if;
  t := me.team_id;
  if p_user = me.id then raise exception 'Hãy chọn một người khác.'; end if;
  select * into tgt from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;
  if tgt.role in ('pending', 'admin') then raise exception 'Người nhận phải là thành viên đã được duyệt (không phải Ban tổ chức).'; end if;
  if tgt.role = 'coach' and tgt.team_id is distinct from t then raise exception 'Người này đang là BHL của đội khác.'; end if;
  if not (exists (select 1 from public.players where user_id = p_user and team_id = t) or (tgt.role = 'coach' and tgt.team_id = t)) then
    raise exception 'Người nhận phải là cầu thủ hoặc BHL của đội.';
  end if;

  update public.profiles set role = 'member', team_id = null where id = me.id;
  update public.profiles set role = 'chair', team_id = t where id = p_user;
  update public.teams set
    chair_name = tgt.name,
    chair_since = extract(year from now())::text,
    coach_name = case when tgt.role = 'coach'
      then coalesce((select name from public.profiles where role = 'coach' and team_id = t and id <> p_user limit 1), 'Chưa bổ nhiệm')
      else coach_name end
  where id = t;
end $$;

-- Approval gives the lowest free number when none is chosen.
create or replace function public.approve_member(
  p_user uuid, p_role text, p_role_team text, p_make_player boolean,
  p_name text, p_pos text, p_ovr int, p_num int, p_age int, p_foot text, p_stats int[], p_photo text, p_team text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles;
  pid text;
  pname text;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được duyệt thành viên.'; end if;
  -- Chairmen / coaches always play for the team they manage.
  if p_role in ('chair', 'coach') then p_team := p_role_team; end if;
  select * into prof from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy tài khoản.'; end if;

  update public.profiles set role = 'member' where id = p_user and role = 'pending';
  if coalesce(p_role, 'member') <> 'member' or prof.role <> 'pending' then
    perform public.set_member(p_user, coalesce(p_role, 'member'), p_role_team);
  end if;

  if p_make_player then
    if exists (select 1 from public.players where user_id = p_user) then raise exception 'Tài khoản này đã có hồ sơ cầu thủ.'; end if;
    if p_team is not null and not exists (select 1 from public.teams where id = p_team) then raise exception 'Đội không tồn tại.'; end if;
    pname := coalesce(nullif(btrim(p_name), ''), prof.name);
    insert into public.players (team_id, user_id, name, pos, ovr, num, age, foot, stats, photo_url)
    values (p_team, p_user, pname, p_pos, p_ovr, coalesce(p_num, public.next_free_num()), coalesce(p_age, 25), coalesce(p_foot, 'Phải'), p_stats, p_photo)
    returning id into pid;
    if p_team is not null then
      insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (pid, pname, null, p_team, 0);
    end if;
  end if;
  return pid;
end $$;

revoke execute on function public.set_my_number(int), public.handover_chair(uuid), public.next_free_num() from public, anon;
grant execute on function public.set_my_number(int), public.handover_chair(uuid), public.next_free_num() to authenticated;
