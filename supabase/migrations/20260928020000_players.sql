-- Approved accounts become players; players without a team are free agents that teams can sign.
-- Pending accounts may read everything members can (view-only) but cannot vote and are not players.

-- ───────────────────────── schema ─────────────────────────

alter table public.players alter column team_id drop not null;          -- null = free agent (Tự do)
alter table public.players add column if not exists user_id uuid unique references public.profiles on delete set null;
alter table public.transfers alter column from_team drop not null;      -- null = signed as free agent
alter table public.transfers alter column to_team drop not null;        -- null = released

-- ───────────────────────── view-only access for pending accounts ─────────────────────────

drop policy if exists "profiles: members read" on public.profiles;
create policy "profiles: members read" on public.profiles for select to authenticated using (true);

drop policy if exists "transfers: members read" on public.transfers;
create policy "transfers: members read" on public.transfers for select to authenticated using (true);

create or replace function public.vote_stats() returns table (match_id text, kind text, key text, n bigint)
language sql stable security definer set search_path = public as $$
  select v.match_id, 'winner', v.winner, count(*) from public.votes v where v.winner is not null and auth.uid() is not null group by v.match_id, v.winner
  union all
  select v.match_id, 'score', v.score, count(*) from public.votes v where v.score is not null and auth.uid() is not null group by v.match_id, v.score
$$;

-- ───────────────────────── approval → player ─────────────────────────

-- Approve a pending account in one step:
--   * p_role: 'member' | 'coach' | 'chair' | 'admin' (+ p_role_team for coach/chair) — staff role, via set_member
--   * p_make_player: also create a linked player profile (p_team null = free agent)
-- Roles and the player profile are independent, so one person can be e.g. chairman of F8 and a player.
-- Returns the new player id (or null).
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
    values (p_team, p_user, pname, p_pos, p_ovr, coalesce(p_num, 99), coalesce(p_age, 25), coalesce(p_foot, 'Phải'), p_stats, p_photo)
    returning id into pid;
    if p_team is not null then
      insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (pid, pname, null, p_team, 0);
    end if;
  end if;
  return pid;
end $$;

-- A chairman (or admin) signs a free agent.
create or replace function public.sign_player(p_player text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  if not (public.is_admin() or public.is_chair_of(p_team)) then raise exception 'Chỉ Chủ tịch đội hoặc Ban tổ chức được tuyển cầu thủ.'; end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'Đội không tồn tại.'; end if;
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if p.team_id is not null then raise exception 'Cầu thủ đã có đội — hãy gửi đề nghị chuyển nhượng.'; end if;
  update public.players set team_id = p_team where id = p.id;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (p.id, p.name, null, p_team, 0);
end $$;

-- The chairman (or admin) releases a player to free agency.
create or replace function public.release_player(p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if p.team_id is null then raise exception 'Cầu thủ đang tự do.'; end if;
  if not (public.is_admin() or public.is_chair_of(p.team_id)) then raise exception 'Chỉ Chủ tịch đội hoặc Ban tổ chức được giải phóng cầu thủ.'; end if;
  update public.players set team_id = null where id = p.id;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (p.id, p.name, p.team_id, null, 0);
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
end $$;

-- Offers are for players under contract; free agents are signed directly.
create or replace function public.make_offer(p_player text, p_price numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  t text := public.my_team();
begin
  if public.my_role() is distinct from 'chair' or t is null then
    raise exception 'Chỉ Chủ tịch đội được gửi đề nghị.';
  end if;
  select * into p from public.players where id = p_player;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if p.team_id is null then raise exception 'Cầu thủ đang tự do — bấm Tuyển để ký hợp đồng.'; end if;
  if p.team_id = t then raise exception 'Cầu thủ đã thuộc đội của bạn.'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Nhập giá đề nghị hợp lệ.'; end if;
  insert into public.offers (player_id, buyer_team, seller_team, price, value, note, created_by)
  values (p.id, t, p.team_id, round(p_price, 1), p.value, left(btrim(coalesce(p_note, '')), 500), auth.uid());
exception when unique_violation then
  raise exception 'Bạn đã gửi đề nghị cho cầu thủ này.';
end $$;

-- Direct transfer: the owning chairman or an admin (admin may also place a free agent).
create or replace function public.transfer_player(p_player text, p_to text, p_fee numeric) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if not (public.is_admin() or (p.team_id is not null and public.is_chair_of(p.team_id))) then
    raise exception 'Chỉ Chủ tịch đội hoặc Ban tổ chức được chuyển nhượng.';
  end if;
  if p_to is null or p_to is not distinct from p.team_id or not exists (select 1 from public.teams where id = p_to) then
    raise exception 'Chọn đội nhận.';
  end if;
  if p_fee is null or p_fee < 0 then raise exception 'Phí chuyển nhượng không hợp lệ.'; end if;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee)
  values (p.id, p.name, p.team_id, p_to, round(p_fee, 1));
  update public.players set team_id = p_to where id = p.id;
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
end $$;

revoke execute on function public.approve_member(uuid, text, text, boolean, text, text, int, int, int, text, int[], text, text), public.sign_player(text, text), public.release_player(text) from public, anon;
grant execute on function public.approve_member(uuid, text, text, boolean, text, text, int, int, int, text, int[], text, text), public.sign_player(text, text), public.release_player(text) to authenticated;
