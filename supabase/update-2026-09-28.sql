-- DigiEx League — cập nhật gộp (ảnh đại diện, đăng ký trận & thống kê, chuyển nhượng v2, lịch cố định & hủy trận).
-- Dán TOÀN BỘ file vào Supabase SQL Editor → Run. Chạy lại nhiều lần vẫn an toàn, không xóa dữ liệu.
-- Yêu cầu đã chạy trước: init, seed, production, cleanup-demo, approval, players, open_signup.

-- ═══════════ 20260928040000_self_photo.sql ═══════════
-- Users set their own photo: profile avatar + their linked player card.
-- Files live at media/avatars/<user id>/…; only that user can write there.

drop policy if exists "media: own avatar upload" on storage.objects;
drop policy if exists "media: own avatar update" on storage.objects;
drop policy if exists "media: own avatar delete" on storage.objects;
create policy "media: own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media: own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "media: own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

-- p_url must be a file in the caller's own avatars/ folder; null resets to the Google photo.
create or replace function public.set_my_photo(p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  google text;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập.'; end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/media/avatars/' || auth.uid()::text || '/%' then
    raise exception 'Ảnh không hợp lệ.';
  end if;
  select raw_user_meta_data ->> 'avatar_url' into google from auth.users where id = auth.uid();
  update public.profiles set avatar_url = coalesce(p_url, google) where id = auth.uid();
  update public.players set photo_url = p_url where user_id = auth.uid();
end $$;

revoke execute on function public.set_my_photo(text) from public, anon;
grant execute on function public.set_my_photo(text) to authenticated;

-- Google profile sync must not overwrite a photo the user chose: only follow Google while the avatar is still Google's.
create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    email = lower(new.email),
    avatar_url = case
      when avatar_url is null or avatar_url is not distinct from (old.raw_user_meta_data ->> 'avatar_url')
        then coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url)
      else avatar_url
    end
  where id = new.id;
  return new;
end $$;

-- ═══════════ 20260928050000_match_players.sql ═══════════
-- Match participation (RSVP) and self-reported post-match stats approved by team staff.
-- * Before kickoff a player joins a match: for their own team, or (free agent) for one of the two sides.
-- * After the match the player submits their stats; the side's BHL / chairman (or an admin) approves or rejects.
-- * Only approved rows count towards season stats.

create table if not exists public.match_players (
  match_id     text not null references public.matches on delete cascade,
  player_id    text not null references public.players on delete cascade,
  team_id      text not null references public.teams on delete cascade,   -- the side they play for
  joined_at    timestamptz not null default now(),
  goals        int check (goals between 0 and 30),
  assists      int check (assists between 0 and 30),
  saves        int check (saves between 0 and 50),
  yellow       int check (yellow between 0 and 2),
  red          int check (red between 0 and 1),
  rating       numeric(3, 1) check (rating between 1 and 10),
  note         text check (length(note) <= 300),
  stats_status text not null default 'none' check (stats_status in ('none', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  reviewed_by  uuid references public.profiles on delete set null,
  reviewed_at  timestamptz,
  primary key (match_id, player_id)
);
create index if not exists match_players_player_idx on public.match_players (player_id);

alter table public.match_players enable row level security;
drop policy if exists "match_players: public read" on public.match_players;
create policy "match_players: public read" on public.match_players for select using (true);
revoke insert, update, delete on public.match_players from anon, authenticated;

-- The caller's own player profile.
create or replace function public.my_player() returns public.players
language sql stable security definer set search_path = public as $$
  select * from public.players where user_id = auth.uid()
$$;

-- Join (or, for a free agent, switch side). p_team is only used by free agents.
create or replace function public.join_match(p_match text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  p public.players;
  side text;
begin
  if not public.is_approved() then raise exception 'Tài khoản của bạn đang chờ Ban tổ chức duyệt.'; end if;
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Không tìm thấy trận.'; end if;
  if m.status <> 'up' or m.kickoff <= now() then raise exception 'Trận đã bắt đầu — hết hạn đăng ký.'; end if;
  if p.team_id is not null then
    if p.team_id not in (m.home_team, m.away_team) then raise exception 'Đội của bạn không thi đấu trận này.'; end if;
    side := p.team_id;
  else
    if p_team is null or p_team not in (m.home_team, m.away_team) then raise exception 'Chọn đội bạn muốn đá cùng.'; end if;
    side := p_team;
  end if;
  insert into public.match_players (match_id, player_id, team_id) values (m.id, p.id, side)
  on conflict (match_id, player_id) do update set team_id = excluded.team_id, joined_at = now();
end $$;

create or replace function public.leave_match(p_match text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'up' and kickoff > now()) then
    raise exception 'Trận đã bắt đầu — không thể hủy đăng ký.';
  end if;
  delete from public.match_players where match_id = p_match and player_id = p.id;
end $$;

-- A participant reports their own stats after the match (again after a rejection; locked once approved).
create or replace function public.submit_match_stats(
  p_match text, p_goals int, p_assists int, p_saves int, p_yellow int, p_red int, p_rating numeric, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  r public.match_players;
begin
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  select * into r from public.match_players where match_id = p_match and player_id = p.id for update;
  if not found then raise exception 'Bạn không có tên trong danh sách thi đấu trận này.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'done') then raise exception 'Trận chưa kết thúc.'; end if;
  if r.stats_status = 'approved' then raise exception 'Thông số đã được duyệt, không thể sửa.'; end if;
  if coalesce(p_goals, 0) not between 0 and 30 or coalesce(p_assists, 0) not between 0 and 30 or coalesce(p_saves, 0) not between 0 and 50
     or coalesce(p_yellow, 0) not between 0 and 2 or coalesce(p_red, 0) not between 0 and 1 or (p_rating is not null and p_rating not between 1 and 10) then
    raise exception 'Thông số không hợp lệ (bàn thắng/kiến tạo 0–30, cứu thua 0–50, thẻ vàng 0–2, thẻ đỏ 0–1, điểm 1–10).';
  end if;
  update public.match_players set
    goals = coalesce(p_goals, 0), assists = coalesce(p_assists, 0), saves = coalesce(p_saves, 0),
    yellow = coalesce(p_yellow, 0), red = coalesce(p_red, 0), rating = p_rating, note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
    stats_status = 'submitted', submitted_at = now(), reviewed_by = null, reviewed_at = null
  where match_id = p_match and player_id = p.id;
end $$;

-- Staff of the side the player played for (or an admin) approve / reject submitted stats.
create or replace function public.review_match_stats(p_match text, p_player text, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.match_players;
begin
  select * into r from public.match_players where match_id = p_match and player_id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ trong trận.'; end if;
  if not public.can_manage_team(r.team_id) then raise exception 'Chỉ BHL / Chủ tịch của đội hoặc Ban tổ chức được duyệt.'; end if;
  if r.stats_status <> 'submitted' then raise exception 'Không có thông số chờ duyệt.'; end if;
  update public.match_players set stats_status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_by = auth.uid(), reviewed_at = now()
  where match_id = p_match and player_id = p_player;
end $$;

revoke execute on function public.join_match(text, text), public.leave_match(text),
  public.submit_match_stats(text, int, int, int, int, int, numeric, text), public.review_match_stats(text, text, boolean) from public, anon;
grant execute on function public.join_match(text, text), public.leave_match(text),
  public.submit_match_stats(text, int, int, int, int, int, numeric, text), public.review_match_stats(text, text, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'match_players') then
    alter publication supabase_realtime add table public.match_players;
  end if;
end $$;

-- ═══════════ 20260928060000_offers_v2.sql ═══════════
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

-- ═══════════ 20260928070000_series_cancel.sql ═══════════
-- Weekly fixed fixtures + cancelling a match with a reason.
-- * match_series: a fixture that repeats every week. When its latest match is finished (result entered, cancelled,
--   or 2 hours past kickoff) the next one is created 7 days later — by trigger, and by roll_series() which the app
--   calls on load (idempotent; a unique index prevents duplicates).
-- * matches.status gains 'cancelled' with cancel_reason; admins and the two chairmen can cancel an upcoming match.

create table if not exists public.match_series (
  id         text primary key default gen_random_uuid()::text,
  home_team  text not null references public.teams on delete cascade,
  away_team  text not null references public.teams on delete cascade,
  venue      text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (home_team <> away_team)
);
alter table public.match_series enable row level security;
drop policy if exists "series: public read" on public.match_series;
drop policy if exists "series: admin update" on public.match_series;
create policy "series: public read" on public.match_series for select using (true);
create policy "series: admin update" on public.match_series for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.match_series from anon, authenticated;
revoke update on public.match_series from anon;

alter table public.matches add column if not exists series_id text references public.match_series on delete set null;
alter table public.matches add column if not exists cancel_reason text check (length(cancel_reason) <= 200);
alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check check (status in ('up', 'done', 'cancelled'));
create unique index if not exists matches_series_kickoff on public.matches (series_id, kickoff) where series_id is not null;

-- Create the next match for one series if its latest match is over. Skips weeks that already passed.
create or replace function public.roll_one_series(p_series text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.match_series;
  last public.matches;
  nxt timestamptz;
begin
  select * into s from public.match_series where id = p_series and active;
  if not found then return; end if;
  select * into last from public.matches where series_id = s.id order by kickoff desc limit 1;
  if not found then return; end if;
  if last.status = 'up' and last.kickoff + interval '2 hours' > now() then return; end if;
  nxt := last.kickoff + interval '7 days';
  while nxt + interval '2 hours' < now() loop nxt := nxt + interval '7 days'; end loop;
  insert into public.matches (kickoff, home_team, away_team, venue, series_id)
  values (nxt, s.home_team, s.away_team, s.venue, s.id)
  on conflict do nothing;
end $$;

create or replace function public.roll_series() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.match_series where active loop
    perform public.roll_one_series(r.id);
  end loop;
end $$;

create or replace function public.on_series_match_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.series_id is not null and new.status in ('done', 'cancelled') and old.status is distinct from new.status then
    perform public.roll_one_series(new.series_id);
  end if;
  return new;
end $$;

drop trigger if exists on_match_closed on public.matches;
create trigger on_match_closed after update of status on public.matches
  for each row execute function public.on_series_match_closed();

-- Admin: start a weekly series; the first match is at p_first.
create or replace function public.create_series(p_home text, p_away text, p_first timestamptz, p_venue text) returns text
language plpgsql security definer set search_path = public as $$
declare sid text;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được lên lịch.'; end if;
  if p_home is null or p_away is null or p_home = p_away then raise exception 'Chọn hai đội khác nhau.'; end if;
  if p_first is null then raise exception 'Chọn thời gian.'; end if;
  insert into public.match_series (home_team, away_team, venue) values (p_home, p_away, coalesce(nullif(btrim(p_venue), ''), 'Sân bóng Hoàng Mai · Sân số 3'))
  returning id into sid;
  insert into public.matches (kickoff, home_team, away_team, venue, series_id)
  values (p_first, p_home, p_away, coalesce(nullif(btrim(p_venue), ''), 'Sân bóng Hoàng Mai · Sân số 3'), sid);
  return sid;
end $$;

-- Admin or either team's chairman cancels an upcoming match with a reason.
create or replace function public.cancel_match(p_match text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Không tìm thấy trận.'; end if;
  if not (public.is_admin() or public.is_chair_of(m.home_team) or public.is_chair_of(m.away_team)) then
    raise exception 'Chỉ Ban tổ chức hoặc Chủ tịch hai đội được hủy trận.';
  end if;
  if m.status <> 'up' then raise exception 'Chỉ hủy được trận chưa diễn ra.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Nhập lý do hủy trận.'; end if;
  update public.matches set status = 'cancelled', cancel_reason = left(btrim(p_reason), 200) where id = m.id;
end $$;

revoke execute on function public.create_series(text, text, timestamptz, text), public.cancel_match(text, text) from public, anon;
grant execute on function public.create_series(text, text, timestamptz, text), public.cancel_match(text, text) to authenticated;
revoke execute on function public.roll_one_series(text) from public, anon, authenticated;
grant execute on function public.roll_series() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'match_series') then
    alter publication supabase_realtime add table public.match_series;
  end if;
end $$;
