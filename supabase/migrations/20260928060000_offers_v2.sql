-- Transfers v2
-- * Chairmen and BHL (coaches) are not transferable: a player whose account holds a chair/coach role can't be
--   offered, invited, moved, signed or released.
-- * Chairmen AND coaches can send offers for their team.
-- * Free agents get an invitation (offers.seller_team = null) that the PLAYER accepts or declines.
-- * Contracted players: the selling chairman decides; the player can see offers about them but cannot respond.
-- * Direct moves (transfer_player / sign_player) are admin-only.

alter table public.offers alter column seller_team drop not null;   -- null = invitation to a free agent
alter table public.offers drop constraint if exists offers_price_check;
alter table public.offers add constraint offers_price_check check (price >= 0);

-- Is this player someone who holds a staff role (chair / coach)?
create or replace function public.is_staff_player(p_player text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.players pl join public.profiles pr on pr.id = pl.user_id
    where pl.id = p_player and pr.role in ('chair', 'coach')
  )
$$;

-- Offers are visible to admins, both clubs' staff, and the player concerned.
drop policy if exists "offers: parties read" on public.offers;
create policy "offers: parties read" on public.offers for select to authenticated using (
  public.is_admin()
  or public.my_team() in (buyer_team, seller_team)
  or exists (select 1 from public.players pl where pl.id = player_id and pl.user_id = auth.uid())
);

-- Chair or coach of the buying team sends an offer (contracted player) or an invitation (free agent).
create or replace function public.make_offer(p_player text, p_price numeric, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  t text := public.my_team();
begin
  if public.my_role() not in ('chair', 'coach') or t is null then
    raise exception 'Chỉ Chủ tịch hoặc BHL của đội được gửi đề nghị.';
  end if;
  select * into p from public.players where id = p_player;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if public.is_staff_player(p.id) then raise exception 'Không thể chuyển nhượng Chủ tịch hoặc BHL.'; end if;
  if p.team_id = t then raise exception 'Cầu thủ đã thuộc đội của bạn.'; end if;
  if p.team_id is not null and (p_price is null or p_price <= 0) then raise exception 'Nhập giá đề nghị hợp lệ.'; end if;
  if p.team_id is null and p.user_id is null then raise exception 'Cầu thủ này chưa có tài khoản để nhận lời mời — liên hệ Ban tổ chức.'; end if;
  insert into public.offers (player_id, buyer_team, seller_team, price, value, note, created_by)
  values (p.id, t, p.team_id, round(coalesce(p_price, 0), 1), p.value, left(btrim(coalesce(p_note, '')), 500), auth.uid());
exception when unique_violation then
  raise exception 'Đội bạn đã gửi đề nghị cho cầu thủ này.';
end $$;

-- Accept / reject. Invitations: only the invited player. Offers: only the selling chairman.
create or replace function public.respond_offer(p_offer text, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
  p public.players;
  buyer text;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.status <> 'pending' then raise exception 'Yêu cầu không còn hiệu lực.'; end if;
  select * into p from public.players where id = o.player_id for update;
  select short into buyer from public.teams where id = o.buyer_team;

  if o.seller_team is null then
    if p.user_id is distinct from auth.uid() then raise exception 'Chỉ cầu thủ được mời mới trả lời được lời mời.'; end if;
  else
    if not public.is_chair_of(o.seller_team) then raise exception 'Chỉ Chủ tịch đội bán được duyệt.'; end if;
  end if;

  if not p_accept then
    update public.offers set status = 'rejected' where id = o.id;
    return case when o.seller_team is null then 'Đã từ chối lời mời của ' || buyer else 'Đã từ chối đề nghị' end;
  end if;
  if p.team_id is distinct from o.seller_team then
    update public.offers set status = 'cancelled' where id = o.id;
    return 'Đề nghị không còn hiệu lực (cầu thủ đã đổi đội)';
  end if;
  if public.is_staff_player(p.id) then
    update public.offers set status = 'cancelled' where id = o.id;
    return 'Không thể chuyển nhượng Chủ tịch hoặc BHL';
  end if;

  update public.players set team_id = o.buyer_team where id = p.id;
  update public.offers set status = 'accepted' where id = o.id;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee)
  values (p.id, p.name, o.seller_team, o.buyer_team, o.price);
  update public.offers set status = 'rejected' where player_id = p.id and status = 'pending';
  return case when o.seller_team is null then 'Chào mừng bạn đến ' || buyer || '!' else 'Chuyển nhượng hoàn tất: ' || p.name || ' → ' || buyer end;
end $$;

-- The buying club's chairman or coach withdraws a pending offer / invitation.
create or replace function public.cancel_offer(p_offer text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.offers;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.status <> 'pending' then raise exception 'Yêu cầu không còn hiệu lực.'; end if;
  if not (public.my_role() in ('chair', 'coach') and public.my_team() = o.buyer_team) then raise exception 'Chỉ đội gửi được hủy.'; end if;
  update public.offers set status = 'cancelled' where id = o.id;
end $$;

-- Direct moves are admin tools now (no consent step).
create or replace function public.transfer_player(p_player text, p_to text, p_fee numeric) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được chuyển trực tiếp.'; end if;
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if public.is_staff_player(p.id) then raise exception 'Không thể chuyển nhượng Chủ tịch hoặc BHL.'; end if;
  if p_to is null or p_to is not distinct from p.team_id or not exists (select 1 from public.teams where id = p_to) then
    raise exception 'Chọn đội nhận.';
  end if;
  if p_fee is null or p_fee < 0 then raise exception 'Phí chuyển nhượng không hợp lệ.'; end if;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee)
  values (p.id, p.name, p.team_id, p_to, round(p_fee, 1));
  update public.players set team_id = p_to where id = p.id;
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
end $$;

create or replace function public.sign_player(p_player text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hãy gửi lời mời — cầu thủ tự do sẽ tự đồng ý.'; end if;
  perform public.transfer_player(p_player, p_team, 0);
end $$;

-- Releasing a chair/coach's player profile is blocked too.
create or replace function public.release_player(p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if p.team_id is null then raise exception 'Cầu thủ đang tự do.'; end if;
  if not (public.is_admin() or public.is_chair_of(p.team_id)) then raise exception 'Chỉ Chủ tịch đội hoặc Ban tổ chức được giải phóng cầu thủ.'; end if;
  if public.is_staff_player(p.id) then raise exception 'Không thể giải phóng Chủ tịch hoặc BHL.'; end if;
  update public.players set team_id = null where id = p.id;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (p.id, p.name, p.team_id, null, 0);
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
end $$;

-- Becoming chair/coach of a team: that person's player profile joins the team they manage (logged as a move)
-- and any pending offers about them are cancelled — staff can't be transferred, so they must play for their own club.
create or replace function public.cancel_offers_for_new_staff() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl public.players;
begin
  if new.role in ('chair', 'coach') and new.team_id is not null
     and (old.role is distinct from new.role or old.team_id is distinct from new.team_id) then
    update public.offers o set status = 'cancelled'
    from public.players p where p.id = o.player_id and p.user_id = new.id and o.status = 'pending';
    select * into pl from public.players where user_id = new.id for update;
    if found and pl.team_id is distinct from new.team_id then
      update public.players set team_id = new.team_id where id = pl.id;
      insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (pl.id, pl.name, pl.team_id, new.team_id, 0);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change after update of role, team_id on public.profiles
  for each row execute function public.cancel_offers_for_new_staff();

-- Fix existing data: chairs / coaches whose player profile is not in the team they manage.
with moved as (
  update public.players pl set team_id = pr.team_id
  from public.profiles pr, (select id, team_id as old_team from public.players) prev
  where pr.id = pl.user_id and prev.id = pl.id and pr.role in ('chair', 'coach') and pr.team_id is not null
    and pl.team_id is distinct from pr.team_id
  returning pl.id, pl.name, prev.old_team, pl.team_id
)
insert into public.transfers (player_id, player_name, from_team, to_team, fee)
select id, name, old_team, team_id, 0 from moved;

-- Approval: a chairman / coach's player profile is created in the team they manage.
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
    values (p_team, p_user, pname, p_pos, p_ovr, coalesce(p_num, 99), coalesce(p_age, 25), coalesce(p_foot, 'Phải'), p_stats, p_photo)
    returning id into pid;
    if p_team is not null then
      insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (pid, pname, null, p_team, 0);
    end if;
  end if;
  return pid;
end $$;

revoke execute on function public.is_staff_player(text) from public, anon;
grant execute on function public.is_staff_player(text) to authenticated;
