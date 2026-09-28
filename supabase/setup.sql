-- DigiEx League: full setup for a NEW project (schema + F8/F9 teams).
-- Paste the WHOLE file into Supabase SQL Editor (nothing selected) and click Run.
-- Safe to re-run: it first removes any DigiEx League objects left by an earlier partial run
-- (this also deletes their data — only use on a fresh project).

drop trigger if exists on_auth_user_created on auth.users;
drop policy if exists "media: public read"  on storage.objects;
drop policy if exists "media: staff upload" on storage.objects;
drop policy if exists "media: staff update" on storage.objects;
drop policy if exists "media: staff delete" on storage.objects;
drop policy if exists "media: own avatar upload" on storage.objects;
drop policy if exists "media: own avatar update" on storage.objects;
drop policy if exists "media: own avatar delete" on storage.objects;
drop table if exists public.match_players, public.offers, public.transfers, public.votes, public.matches, public.players, public.profiles, public.teams cascade;
drop function if exists public.handle_new_user(), public.my_role(), public.my_team(), public.is_admin(),
  public.can_manage_team(text), public.is_chair_of(text), public.player_value(int),
  public.vote_winner(text, text), public.vote_score(text, text), public.vote_stats(),
  public.transfer_player(text, text, numeric), public.make_offer(text, numeric, text),
  public.respond_offer(text, boolean), public.cancel_offer(text),
  public.allowed_email(text), public.handle_user_updated(), public.set_member(uuid, text, text),
  public.update_team(text, text, text, text, text, text, text), public.save_result(text, int, int, jsonb),
  public.is_approved(), public.reject_member(uuid),
  public.approve_member(uuid, text, text, boolean, text, text, int, int, int, text, int[], text, text), public.sign_player(text, text), public.release_player(text),
  public.set_my_photo(text), public.my_player(), public.join_match(text, text), public.leave_match(text),
  public.submit_match_stats(text, int, int, int, int, int, numeric, text), public.review_match_stats(text, text, boolean),
  public.is_staff_player(text), public.cancel_offers_for_new_staff(),
  public.roll_one_series(text), public.roll_series(), public.on_series_match_closed(), public.create_series(text, text, timestamptz, text), public.cancel_match(text, text),
  public.next_free_num(), public.check_unique_num(), public.set_my_number(int), public.handover_chair(uuid),
  public.compute_ovr(text, int[]), public.players_derive(), public.set_my_positions(text[]),
  public.vn_today(), public.value_factors(text), public.compute_player_value(text), public.refresh_player_value(text), public.refresh_all_values(),
  public.daily_value_refresh(), public.tg_value_player(), public.tg_value_related(), public.tg_value_match(),
  public.draw_tournament(text), public.register_tournament(text, boolean), public.set_mom(text, text), public.set_my_name(text), public.delete_user(uuid, boolean),
  public.apply_team(text, text), public.cancel_application(text), public.respond_application(text, boolean), public.lapse_applications(), public.save_lineup(text, text, text, jsonb),
  public.xp_cost(int), public.pos_weights(text), public.xp_split(text, int), public.pos_group(text), public.apply_xp(text, int[]),
  public.grant_xp(text, text, text, int[], text, uuid), public.refresh_match_xp(text), public.tg_match_xp(), public.hot_bonus(text), public.starter_stats(text), public.players_starter(),
  public.vn_when(timestamptz), public.mark_notifications_read(bigint[]), public.notify_new_match(), public.notify_new_tournament(), public.notify_application() cascade;
drop table if exists public.notifications, public.player_xp, public.team_lineups, public.team_applications, public.player_value_history, public.app_state, public.tournament_awards, public.tournament_teams, public.tournaments cascade;
drop table if exists public.match_series cascade;
drop trigger if exists on_auth_user_updated on auth.users;
drop table if exists public.bootstrap_admins;
-- DigiEx League schema.
-- Reads are open (guests see teams, players, fixtures); market data, offers and votes need a signed-in user.
-- All writes are guarded by RLS or go through SECURITY DEFINER functions that re-check the caller's role.

-- ───────────────────────── tables ─────────────────────────

create table public.teams (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(btrim(name)) between 1 and 60),
  short       text not null check (length(short) between 1 and 4),
  color       text not null default '#a855f7' check (color ~ '^#[0-9a-fA-F]{6}$'),
  color2      text not null default '#3b0f6b' check (color2 ~ '^#[0-9a-fA-F]{6}$'),
  motto       text not null default 'Chiến đến cùng',
  founded     int  not null default extract(year from now())::int,
  chair_name  text not null default 'Chưa bổ nhiệm',
  chair_since text not null default extract(year from now())::text,
  chair_quote text not null default 'Hành trình mới bắt đầu.',
  coach_name  text not null default 'Chưa bổ nhiệm',
  logo_url    text,
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text not null unique,
  name       text not null,
  role       text not null default 'member' check (role in ('admin', 'chair', 'coach', 'member')),
  team_id    text references public.teams on delete set null,
  created_at timestamptz not null default now()
);

-- Market value in "tỷ" derived from OVR. Mirrors valOf() in src/lib/league.ts.
create function public.player_value(ovr int) returns numeric
language sql immutable as $$
  select round((power(1.15::float8, ovr - 60) * 8)::numeric) / 10
$$;

create table public.players (
  id         text primary key default gen_random_uuid()::text,
  team_id    text not null references public.teams on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  pos        text not null check (pos in ('GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST')),
  ovr        int  not null check (ovr between 40 and 99),
  num        int  not null default 99 check (num between 0 and 99),
  age        int  not null default 25 check (age between 10 and 80),
  foot       text not null default 'Phải' check (foot in ('Phải', 'Trái')),
  stats      int[] not null check (array_length(stats, 1) = 6 and 20 <= all (stats) and 99 >= all (stats)),
  value      numeric(8, 1) generated always as (public.player_value(ovr)) stored,
  photo_url  text,
  created_at timestamptz not null default now()
);
create index on public.players (team_id);

create table public.matches (
  id          text primary key default gen_random_uuid()::text,
  kickoff     timestamptz not null,
  home_team   text not null references public.teams on delete cascade,
  away_team   text not null references public.teams on delete cascade,
  home_score  int  not null default 0 check (home_score between 0 and 99),
  away_score  int  not null default 0 check (away_score between 0 and 99),
  status      text not null default 'up' check (status in ('up', 'done')),
  venue       text not null default 'Sân bóng Hoàng Mai · Sân số 3',
  -- [{ "pid": "<player id>", "side": "home" | "away", "min": 12 }]
  scorers     jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  check (home_team <> away_team)
);

create table public.votes (
  match_id   text not null references public.matches on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  winner     text check (winner in ('home', 'draw', 'away')),
  score      text check (score ~ '^[0-9]{1,2}-[0-9]{1,2}$'),
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table public.transfers (
  id          bigint generated always as identity primary key,
  player_id   text references public.players on delete set null,
  player_name text not null,
  from_team   text not null references public.teams on delete cascade,
  to_team     text not null references public.teams on delete cascade,
  fee         numeric(8, 1) not null check (fee >= 0),
  created_on  date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date
);

create table public.offers (
  id          text primary key default gen_random_uuid()::text,
  player_id   text not null references public.players on delete cascade,
  buyer_team  text not null references public.teams on delete cascade,
  seller_team text not null references public.teams on delete cascade,
  price       numeric(8, 1) not null check (price > 0),
  value       numeric(8, 1) not null,
  note        text not null default '' check (length(note) <= 500),
  created_by  uuid references public.profiles on delete set null,
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_on  date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  created_at  timestamptz not null default now(),
  check (buyer_team <> seller_team)
);
-- One open offer per player per buying team.
create unique index offers_one_pending on public.offers (player_id, buyer_team) where status = 'pending';

-- ───────────────────────── role helpers ─────────────────────────

create function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.my_team() returns text
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Admin, or the chairman / coaching staff of team t.
create function public.can_manage_team(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.my_role() in ('chair', 'coach') and public.my_team() = t, false)
$$;

create function public.is_chair_of(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'chair' and public.my_team() = t, false)
$$;

-- ───────────────────────── new-user profile ─────────────────────────

-- Every new auth user becomes a plain member; roles are granted by an admin (see README).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── RLS ─────────────────────────

alter table public.teams     enable row level security;
alter table public.profiles  enable row level security;
alter table public.players   enable row level security;
alter table public.matches   enable row level security;
alter table public.votes     enable row level security;
alter table public.transfers enable row level security;
alter table public.offers    enable row level security;

create policy "teams: public read"   on public.teams for select using (true);
create policy "teams: admin insert"  on public.teams for insert to authenticated with check (public.is_admin());
create policy "teams: staff update"  on public.teams for update to authenticated using (public.can_manage_team(id)) with check (public.can_manage_team(id));
create policy "teams: admin delete"  on public.teams for delete to authenticated using (public.is_admin());

create policy "profiles: members read" on public.profiles for select to authenticated using (true);

create policy "players: public read"  on public.players for select using (true);
create policy "players: staff insert" on public.players for insert to authenticated with check (public.can_manage_team(team_id));
create policy "players: staff update" on public.players for update to authenticated using (public.can_manage_team(team_id)) with check (public.can_manage_team(team_id));
create policy "players: staff delete" on public.players for delete to authenticated using (public.can_manage_team(team_id));

create policy "matches: public read"  on public.matches for select using (true);
create policy "matches: admin insert" on public.matches for insert to authenticated with check (public.is_admin());
create policy "matches: admin update" on public.matches for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "matches: admin delete" on public.matches for delete to authenticated using (public.is_admin());

-- Individual votes are private; totals come from vote_stats().
create policy "votes: own read" on public.votes for select to authenticated using (user_id = auth.uid());

create policy "transfers: members read" on public.transfers for select to authenticated using (true);

create policy "offers: parties read" on public.offers for select to authenticated
  using (public.is_admin() or public.my_team() in (buyer_team, seller_team));

-- Staff may only touch these team columns (not name/short/colours).
revoke update on public.teams from anon, authenticated;
grant update (logo_url, motto, chair_quote, coach_name) on public.teams to authenticated;
-- Votes, transfers and offers change only through the functions below.
revoke insert, update, delete on public.votes, public.transfers, public.offers, public.profiles from anon, authenticated;
revoke insert, update, delete on public.teams, public.players, public.matches from anon;

-- ───────────────────────── RPCs ─────────────────────────

create function public.vote_winner(p_match text, p_winner text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'up') then
    raise exception 'Trận đã kết thúc hoặc không tồn tại.';
  end if;
  insert into public.votes (match_id, user_id, winner) values (p_match, auth.uid(), p_winner)
  on conflict (match_id, user_id) do update set winner = excluded.winner where public.votes.winner is null;
  if not found then raise exception 'Bạn đã vote trận này.'; end if;
end $$;

create function public.vote_score(p_match text, p_score text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'up') then
    raise exception 'Trận đã kết thúc hoặc không tồn tại.';
  end if;
  insert into public.votes (match_id, user_id, score) values (p_match, auth.uid(), p_score)
  on conflict (match_id, user_id) do update set score = excluded.score where public.votes.score is null;
  if not found then raise exception 'Bạn đã dự đoán trận này.'; end if;
end $$;

-- Aggregated vote counts for every match: kind = 'winner' | 'score'.
create function public.vote_stats() returns table (match_id text, kind text, key text, n bigint)
language sql stable security definer set search_path = public as $$
  select v.match_id, 'winner', v.winner, count(*) from public.votes v where v.winner is not null group by v.match_id, v.winner
  union all
  select v.match_id, 'score', v.score, count(*) from public.votes v where v.score is not null group by v.match_id, v.score
$$;

-- Direct transfer by the owning chairman or an admin.
create function public.transfer_player(p_player text, p_to text, p_fee numeric) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where id = p_player for update;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if not (public.is_admin() or public.is_chair_of(p.team_id)) then
    raise exception 'Chỉ Chủ tịch đội hoặc Ban tổ chức được chuyển nhượng.';
  end if;
  if p_to is null or p_to = p.team_id or not exists (select 1 from public.teams where id = p_to) then
    raise exception 'Chọn đội nhận.';
  end if;
  if p_fee is null or p_fee < 0 then raise exception 'Phí chuyển nhượng không hợp lệ.'; end if;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee)
  values (p.id, p.name, p.team_id, p_to, round(p_fee, 1));
  update public.players set team_id = p_to where id = p.id;
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
end $$;

-- A chairman asks another team's chairman to sell a player.
create function public.make_offer(p_player text, p_price numeric, p_note text) returns void
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
  if p.team_id = t then raise exception 'Cầu thủ đã thuộc đội của bạn.'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Nhập giá đề nghị hợp lệ.'; end if;
  insert into public.offers (player_id, buyer_team, seller_team, price, value, note, created_by)
  values (p.id, t, p.team_id, round(p_price, 1), p.value, left(btrim(coalesce(p_note, '')), 500), auth.uid());
exception when unique_violation then
  raise exception 'Bạn đã gửi đề nghị cho cầu thủ này.';
end $$;

-- The selling chairman accepts or rejects. Returns a message for the UI.
create function public.respond_offer(p_offer text, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.offers;
  p public.players;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.status <> 'pending' then raise exception 'Yêu cầu không còn hiệu lực.'; end if;
  if not public.is_chair_of(o.seller_team) then raise exception 'Chỉ Chủ tịch đội bán được duyệt.'; end if;
  if not p_accept then
    update public.offers set status = 'rejected' where id = o.id;
    return 'Đã từ chối đề nghị';
  end if;
  select * into p from public.players where id = o.player_id for update;
  if not found or p.team_id <> o.seller_team then
    update public.offers set status = 'cancelled' where id = o.id;
    return 'Cầu thủ không còn thuộc đội của bạn';
  end if;
  update public.players set team_id = o.buyer_team where id = p.id;
  update public.offers set status = 'accepted' where id = o.id;
  insert into public.transfers (player_id, player_name, from_team, to_team, fee)
  values (p.id, p.name, o.seller_team, o.buyer_team, o.price);
  update public.offers set status = 'rejected' where player_id = p.id and status = 'pending';
  return 'Chuyển nhượng hoàn tất: ' || p.name || ' → ' || (select short from public.teams where id = o.buyer_team);
end $$;

-- The buying chairman withdraws a pending offer.
create function public.cancel_offer(p_offer text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.offers;
begin
  select * into o from public.offers where id = p_offer for update;
  if not found or o.status <> 'pending' then raise exception 'Yêu cầu không còn hiệu lực.'; end if;
  if not public.is_chair_of(o.buyer_team) then raise exception 'Chỉ đội gửi được hủy.'; end if;
  update public.offers set status = 'cancelled' where id = o.id;
end $$;

revoke execute on function
  public.vote_winner(text, text), public.vote_score(text, text), public.vote_stats(),
  public.transfer_player(text, text, numeric), public.make_offer(text, numeric, text),
  public.respond_offer(text, boolean), public.cancel_offer(text)
from public, anon;
grant execute on function
  public.vote_winner(text, text), public.vote_score(text, text), public.vote_stats(),
  public.transfer_player(text, text, numeric), public.make_offer(text, numeric, text),
  public.respond_offer(text, boolean), public.cancel_offer(text)
to authenticated;

-- ───────────────────────── storage ─────────────────────────
-- Public bucket; objects live at logos/<team_id>/… and players/<team_id>/….

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "media: public read" on storage.objects for select using (bucket_id = 'media');
create policy "media: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.can_manage_team((storage.foldername(name))[2]));
create policy "media: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.can_manage_team((storage.foldername(name))[2]));
create policy "media: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.can_manage_team((storage.foldername(name))[2]));

-- ───────────────────────── realtime ─────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.teams, public.players, public.matches, public.transfers, public.offers;
  end if;
end $$;
-- Production auth + admin tooling.
-- * Google sign-in only; accounts outside the company domain are refused when the auth user is created.
-- * Emails listed in public.bootstrap_admins become admin on first sign-in.
-- * Admin RPCs to manage member roles, edit teams and record results.

-- ───────────────────────── config ─────────────────────────

create table if not exists public.bootstrap_admins (email text primary key);
alter table public.bootstrap_admins enable row level security;  -- no policies: invisible to clients
insert into public.bootstrap_admins (email) values ('son.pham@digiex.group') on conflict do nothing;

create or replace function public.allowed_email(e text) returns boolean
language sql immutable as $$
  select lower(coalesce(e, '')) like '%@digiex.group'
$$;

-- ───────────────────────── profiles ─────────────────────────

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists avatar_url text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(split_part(new.email, '@', 1));
  uname text := base;
  n int := 1;
begin
  if not public.allowed_email(new.email) then
    raise exception 'Chỉ tài khoản @digiex.group được đăng nhập.';
  end if;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, username, name, email, avatar_url, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), base),
    lower(new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (select 1 from public.bootstrap_admins b where b.email = lower(new.email)) then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Keep name/avatar in sync when Google profile data changes.
create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    email = lower(new.email),
    avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url)
  where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- ───────────────────────── admin RPCs ─────────────────────────

-- Set a member's role and team. Chairman/coach names on the team card follow the assignment.
create or replace function public.set_member(p_user uuid, p_role text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev public.profiles;
  cur public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được phân quyền.'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'Bạn không thể tự bỏ quyền Ban tổ chức của mình.'; end if;
  if p_role not in ('admin', 'chair', 'coach', 'member') then raise exception 'Vai trò không hợp lệ.'; end if;
  if p_role in ('chair', 'coach') and (p_team is null or not exists (select 1 from public.teams where id = p_team)) then
    raise exception 'Chọn đội cho Chủ tịch / BHL.';
  end if;
  select * into prev from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;

  update public.profiles set role = p_role, team_id = case when p_role in ('chair', 'coach') then p_team else null end
  where id = p_user returning * into cur;

  -- Only one chairman per team: demote the previous one.
  if p_role = 'chair' then
    update public.profiles set role = 'member', team_id = null where role = 'chair' and team_id = p_team and id <> p_user;
    update public.teams set chair_name = cur.name, chair_since = extract(year from now())::text where id = p_team;
  elsif p_role = 'coach' then
    update public.teams set coach_name = cur.name where id = p_team;
  end if;
  -- Clear the name on the team they left.
  if prev.role = 'chair' and prev.team_id is not null and (p_role <> 'chair' or p_team is distinct from prev.team_id) then
    update public.teams set chair_name = 'Chưa bổ nhiệm' where id = prev.team_id and chair_name = prev.name;
  end if;
  if prev.role = 'coach' and prev.team_id is not null and (p_role <> 'coach' or p_team is distinct from prev.team_id) then
    update public.teams set coach_name = coalesce((select name from public.profiles where role = 'coach' and team_id = prev.team_id limit 1), 'Chưa bổ nhiệm')
    where id = prev.team_id;
  end if;
end $$;

-- Staff edit motto / chairman quote; admins may also rename and recolour.
create or replace function public.update_team(p_team text, p_name text, p_short text, p_motto text, p_quote text, p_color text, p_color2 text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_team(p_team) then raise exception 'Bạn không có quyền với đội này.'; end if;
  update public.teams set
    motto = coalesce(nullif(btrim(p_motto), ''), motto),
    chair_quote = coalesce(nullif(btrim(p_quote), ''), chair_quote)
  where id = p_team;
  if public.is_admin() then
    update public.teams set
      name = coalesce(nullif(btrim(p_name), ''), name),
      short = coalesce(nullif(upper(left(btrim(p_short), 4)), ''), short),
      color = coalesce(p_color, color),
      color2 = coalesce(p_color2, color2)
    where id = p_team;
  end if;
end $$;

-- Record (or correct) a result with optional scorers: [{ "pid", "side", "min"? }].
create or replace function public.save_result(p_match text, p_hs int, p_as int, p_scorers jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được nhập kết quả.'; end if;
  if p_hs < 0 or p_as < 0 then raise exception 'Tỉ số không hợp lệ.'; end if;
  if jsonb_typeof(coalesce(p_scorers, '[]')) <> 'array' then raise exception 'Danh sách ghi bàn không hợp lệ.'; end if;
  update public.matches set home_score = p_hs, away_score = p_as, status = 'done', scorers = coalesce(p_scorers, '[]')
  where id = p_match;
  if not found then raise exception 'Không tìm thấy trận.'; end if;
end $$;

revoke execute on function public.set_member(uuid, text, text), public.update_team(text, text, text, text, text, text, text), public.save_result(text, int, int, jsonb) from public, anon;
grant execute on function public.set_member(uuid, text, text), public.update_team(text, text, text, text, text, text, text), public.save_result(text, int, int, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
-- New accounts wait for admin approval.
-- 'pending' users are signed in but see only what guests see; an admin approves (→ member) or rejects (account deleted).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'chair', 'coach', 'member', 'pending'));
alter table public.profiles alter column role set default 'pending';

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'chair', 'coach', 'member'), false)
$$;

-- New sign-ins start as pending (bootstrap admins excepted).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(split_part(new.email, '@', 1));
  uname text := base;
  n int := 1;
begin
  if not public.allowed_email(new.email) then
    raise exception 'Chỉ tài khoản @digiex.group được đăng nhập.';
  end if;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, username, name, email, avatar_url, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), base),
    lower(new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (select 1 from public.bootstrap_admins b where b.email = lower(new.email)) then 'admin' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Member-only reads now require an approved account.
drop policy if exists "profiles: members read" on public.profiles;
create policy "profiles: members read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_approved());

drop policy if exists "transfers: members read" on public.transfers;
create policy "transfers: members read" on public.transfers for select to authenticated using (public.is_approved());

create or replace function public.vote_stats() returns table (match_id text, kind text, key text, n bigint)
language sql stable security definer set search_path = public as $$
  select v.match_id, 'winner', v.winner, count(*) from public.votes v where v.winner is not null and public.is_approved() group by v.match_id, v.winner
  union all
  select v.match_id, 'score', v.score, count(*) from public.votes v where v.score is not null and public.is_approved() group by v.match_id, v.score
$$;

create or replace function public.vote_winner(p_match text, p_winner text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved() then raise exception 'Tài khoản của bạn đang chờ Ban tổ chức duyệt.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'up') then
    raise exception 'Trận đã kết thúc hoặc không tồn tại.';
  end if;
  insert into public.votes (match_id, user_id, winner) values (p_match, auth.uid(), p_winner)
  on conflict (match_id, user_id) do update set winner = excluded.winner where public.votes.winner is null;
  if not found then raise exception 'Bạn đã vote trận này.'; end if;
end $$;

create or replace function public.vote_score(p_match text, p_score text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved() then raise exception 'Tài khoản của bạn đang chờ Ban tổ chức duyệt.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'up') then
    raise exception 'Trận đã kết thúc hoặc không tồn tại.';
  end if;
  insert into public.votes (match_id, user_id, score) values (p_match, auth.uid(), p_score)
  on conflict (match_id, user_id) do update set score = excluded.score where public.votes.score is null;
  if not found then raise exception 'Bạn đã dự đoán trận này.'; end if;
end $$;

-- Reject a pending sign-up: deletes the auth account (they can request again by signing in later).
create or replace function public.reject_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được duyệt thành viên.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'pending') then
    raise exception 'Chỉ từ chối được tài khoản đang chờ duyệt.';
  end if;
  delete from auth.users where id = p_user;
end $$;

-- set_member: 'pending' is not an assignable role (approve = set to member).
create or replace function public.set_member(p_user uuid, p_role text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev public.profiles;
  cur public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được phân quyền.'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'Bạn không thể tự bỏ quyền Ban tổ chức của mình.'; end if;
  if p_role not in ('admin', 'chair', 'coach', 'member') then raise exception 'Vai trò không hợp lệ.'; end if;
  if p_role in ('chair', 'coach') and (p_team is null or not exists (select 1 from public.teams where id = p_team)) then
    raise exception 'Chọn đội cho Chủ tịch / BHL.';
  end if;
  select * into prev from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;

  update public.profiles set role = p_role, team_id = case when p_role in ('chair', 'coach') then p_team else null end
  where id = p_user returning * into cur;

  if p_role = 'chair' then
    update public.profiles set role = 'member', team_id = null where role = 'chair' and team_id = p_team and id <> p_user;
    update public.teams set chair_name = cur.name, chair_since = extract(year from now())::text where id = p_team;
  elsif p_role = 'coach' then
    update public.teams set coach_name = cur.name where id = p_team;
  end if;
  if prev.role = 'chair' and prev.team_id is not null and (p_role <> 'chair' or p_team is distinct from prev.team_id) then
    update public.teams set chair_name = 'Chưa bổ nhiệm' where id = prev.team_id and chair_name = prev.name;
  end if;
  if prev.role = 'coach' and prev.team_id is not null and (p_role <> 'coach' or p_team is distinct from prev.team_id) then
    update public.teams set coach_name = coalesce((select name from public.profiles where role = 'coach' and team_id = prev.team_id limit 1), 'Chưa bổ nhiệm')
    where id = prev.team_id;
  end if;
end $$;

revoke execute on function public.reject_member(uuid) from public, anon;
grant execute on function public.reject_member(uuid) to authenticated;
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
-- Any Google account may sign up; admin approval (pending → member) is the gate now.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(split_part(coalesce(new.email, 'user'), '@', 1));
  uname text := base;
  n int := 1;
begin
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, username, name, email, avatar_url, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), base),
    lower(new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (select 1 from public.bootstrap_admins b where b.email = lower(new.email)) then 'admin' else 'pending' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop function if exists public.allowed_email(text);
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
-- OVR is computed from the primary position + the six stats (weights per position); nobody sets it by hand.
-- Players have 1–3 preferred positions (positions[1] = primary = players.pos) and can change them themselves.
-- Mirrors ovrOf() / POS_WEIGHTS in src/lib/league.ts.

alter table public.players add column if not exists positions text[];
update public.players set positions = array[pos] where positions is null or cardinality(positions) = 0;

-- Stats order: PAC SHO PAS DRI DEF PHY (GK: DIV HAN KIC REF SPD POS).
create or replace function public.compute_ovr(p_pos text, s int[]) returns int
language sql immutable as $$
  select greatest(40, least(99, round(
    s[1] * w[1] + s[2] * w[2] + s[3] * w[3] + s[4] * w[4] + s[5] * w[5] + s[6] * w[6]
  )::int))
  from (select case p_pos
    when 'ST'  then array[.25, .35, .08, .17, .00, .15]
    when 'LW'  then array[.30, .22, .15, .25, .00, .08]
    when 'RW'  then array[.30, .22, .15, .25, .00, .08]
    when 'CAM' then array[.12, .20, .30, .30, .00, .08]
    when 'CM'  then array[.10, .10, .35, .20, .12, .13]
    when 'CDM' then array[.08, .03, .25, .10, .32, .22]
    when 'LB'  then array[.28, .00, .17, .13, .27, .15]
    when 'RB'  then array[.28, .00, .17, .13, .27, .15]
    when 'CB'  then array[.12, .00, .10, .05, .45, .28]
    when 'GK'  then array[.23, .22, .08, .27, .05, .15]
    else array[1/6.0, 1/6.0, 1/6.0, 1/6.0, 1/6.0, 1/6.0] end::numeric[] as w) x
$$;

-- Normalise positions, keep pos = primary position, and compute OVR on every write.
create or replace function public.players_derive() returns trigger
language plpgsql as $$
declare bad text;
begin
  if new.positions is null or cardinality(new.positions) = 0 then new.positions := array[new.pos]; end if;
  if tg_op = 'UPDATE' and new.pos is distinct from old.pos and new.positions = old.positions then
    -- legacy writers that only change pos: make it the primary position
    new.positions := array_prepend(new.pos, array_remove(old.positions, new.pos));
  end if;
  if cardinality(new.positions) > 3 then raise exception 'Chọn tối đa 3 vị trí.'; end if;
  select p into bad from unnest(new.positions) p where p not in ('GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST') limit 1;
  if bad is not null then raise exception 'Vị trí không hợp lệ: %', bad; end if;
  if (select count(distinct p) from unnest(new.positions) p) <> cardinality(new.positions) then raise exception 'Vị trí bị trùng.'; end if;
  new.pos := new.positions[1];
  new.ovr := public.compute_ovr(new.pos, new.stats);
  return new;
end $$;

drop trigger if exists players_derive on public.players;
create trigger players_derive before insert or update on public.players
  for each row execute function public.players_derive();

alter table public.players drop constraint if exists players_positions_check;
alter table public.players add constraint players_positions_check check (cardinality(positions) between 1 and 3 and positions[1] = pos);
alter table public.players alter column positions set not null;

-- Recompute every existing OVR with the new formula.
update public.players set stats = stats;

-- A player chooses their own positions (first = primary).
create or replace function public.set_my_positions(p_positions text[]) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  if p_positions is null or cardinality(p_positions) = 0 then raise exception 'Chọn ít nhất 1 vị trí.'; end if;
  update public.players set positions = p_positions where id = p.id;
end $$;

revoke execute on function public.set_my_positions(text[]) from public, anon;
grant execute on function public.set_my_positions(text[]) to authenticated;
-- Dynamic market value.
-- value = base(OVR) × age × position × form × attendance × hotness, floored at 80% of a recent (≤30 days) fee.
--   base       player_value(ovr) (unchanged exponential curve)
--   age        ≤21 ×1.10 · 22–23 ×1.05 · 24–29 ×1.15 · 30–32 ×1.00 · 33–34 ×0.90 · 35+ ×0.75
--   position   ST/LW/RW ×1.10 · CAM ×1.05 · CM/CDM ×1.00 · CB/LB/RB ×0.95 · GK ×0.90
--   form       last 5 approved match stats: 1 + 4%/goal + 3%/assist + 5%×(avg rating − 6.5) − 10%/red, clamped 0.7–1.4
--   attendance share of the current team's last 5 finished matches the player registered for: 0.9 + 0.2×share
--   hotness    +5% per pending offer/invitation, max +20%
-- Recomputed by triggers (stats/OVR/age/position/team, match stats, offers, transfers, results) and once a day on
-- first page load (daily_value_refresh). Every refresh records the day's value in player_value_history (for trends).

alter table public.players alter column value drop expression if exists;

create table if not exists public.player_value_history (
  player_id text not null references public.players on delete cascade,
  day       date not null,
  value     numeric(8, 1) not null,
  primary key (player_id, day)
);
alter table public.player_value_history enable row level security;
drop policy if exists "value history: public read" on public.player_value_history;
create policy "value history: public read" on public.player_value_history for select using (true);
revoke insert, update, delete on public.player_value_history from anon, authenticated;

create table if not exists public.app_state (key text primary key, value text not null);
alter table public.app_state enable row level security;  -- no policies: internal only

create or replace function public.vn_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- All factors for one player (also shown in the UI as "Vì sao giá này?").
create or replace function public.value_factors(p_player text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p public.players;
  base numeric; f_age numeric; f_pos numeric; f_form numeric := 1; f_att numeric := 1; f_hot numeric;
  n int; g int; a int; r numeric; red int; total int; played int; pend int; fee numeric; v numeric; floored boolean := false;
begin
  select * into p from public.players where id = p_player;
  if not found then return null; end if;
  base := public.player_value(p.ovr);
  f_age := case when p.age <= 21 then 1.10 when p.age <= 23 then 1.05 when p.age <= 29 then 1.15
                when p.age <= 32 then 1.00 when p.age <= 34 then 0.90 else 0.75 end;
  f_pos := case when p.pos in ('ST', 'LW', 'RW') then 1.10 when p.pos = 'CAM' then 1.05
                when p.pos in ('CB', 'LB', 'RB') then 0.95 when p.pos = 'GK' then 0.90 else 1.00 end;

  select count(*), coalesce(sum(x.goals), 0), coalesce(sum(x.assists), 0), avg(x.rating), coalesce(sum(x.red), 0)
    into n, g, a, r, red
  from (select mp.goals, mp.assists, mp.rating, mp.red from public.match_players mp join public.matches m on m.id = mp.match_id
        where mp.player_id = p.id and mp.stats_status = 'approved' order by m.kickoff desc limit 5) x;
  if n > 0 then
    f_form := greatest(0.7, least(1.4, 1 + 0.04 * g + 0.03 * a + coalesce(0.05 * (r - 6.5), 0) - 0.10 * red));
  end if;

  if p.team_id is not null then
    select count(*), count(mp.player_id) into total, played
    from (select id from public.matches where status = 'done' and p.team_id in (home_team, away_team) order by kickoff desc limit 5) m
    left join public.match_players mp on mp.match_id = m.id and mp.player_id = p.id;
    if total > 0 then f_att := 0.9 + 0.2 * played / total; end if;
  end if;

  select count(*) into pend from public.offers where player_id = p.id and status = 'pending';
  f_hot := 1 + 0.05 * least(pend, 4);

  v := base * f_age * f_pos * f_form * f_att * f_hot;
  select t.fee into fee from public.transfers t
  where t.player_id = p.id and t.to_team is not distinct from p.team_id and t.fee > 0 and t.created_on >= public.vn_today() - 30
  order by t.id desc limit 1;
  if fee is not null and v < 0.8 * fee then v := 0.8 * fee; floored := true; end if;
  v := greatest(0.1, round(v, 1));

  return jsonb_build_object(
    'value', v, 'base', round(base, 1), 'age', f_age, 'position', f_pos, 'form', round(f_form, 3), 'attendance', round(f_att, 3),
    'hot', f_hot, 'floor', case when floored then round(0.8 * fee, 1) end,
    'matches', n, 'goals', g, 'assists', a, 'rating', round(r, 2), 'red', red, 'played', played, 'teamMatches', total, 'offers', pend);
end $$;

create or replace function public.compute_player_value(p_player text) returns numeric
language sql stable security definer set search_path = public as $$
  select (public.value_factors(p_player) ->> 'value')::numeric
$$;

create or replace function public.refresh_player_value(p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if p_player is null then return; end if;
  v := public.compute_player_value(p_player);
  if v is null then return; end if;
  update public.players set value = v where id = p_player and value is distinct from v;
  insert into public.player_value_history (player_id, day, value) values (p_player, public.vn_today(), v)
  on conflict (player_id, day) do update set value = excluded.value;
end $$;

create or replace function public.refresh_all_values() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.players loop perform public.refresh_player_value(r.id); end loop;
end $$;

-- Called by the app on load; does the full refresh at most once per (Vietnam) day.
create or replace function public.daily_value_refresh() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.app_state where key = 'values_refreshed_on' and value = public.vn_today()::text) then return; end if;
  insert into public.app_state (key, value) values ('values_refreshed_on', public.vn_today()::text)
  on conflict (key) do update set value = excluded.value;
  perform public.refresh_all_values();
end $$;

-- ───────── triggers ─────────
create or replace function public.tg_value_player() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.refresh_player_value(new.id); return null; end $$;
drop trigger if exists value_on_player on public.players;
-- column list: the value update itself (SET value = …) does not re-fire this trigger
create trigger value_on_player after insert or update of ovr, age, pos, positions, stats, team_id on public.players
  for each row execute function public.tg_value_player();

create or replace function public.tg_value_related() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.refresh_player_value(old.player_id);
  else perform public.refresh_player_value(new.player_id); end if;
  return null;
end $$;
drop trigger if exists value_on_match_players on public.match_players;
create trigger value_on_match_players after insert or update or delete on public.match_players
  for each row execute function public.tg_value_related();
drop trigger if exists value_on_offers on public.offers;
create trigger value_on_offers after insert or update on public.offers
  for each row execute function public.tg_value_related();
drop trigger if exists value_on_transfers on public.transfers;
create trigger value_on_transfers after insert on public.transfers
  for each row execute function public.tg_value_related();

-- A finished match changes attendance for both squads.
create or replace function public.tg_value_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status is distinct from old.status then
    for r in select id from public.players where team_id in (new.home_team, new.away_team) loop
      perform public.refresh_player_value(r.id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists value_on_match on public.matches;
create trigger value_on_match after update of status on public.matches
  for each row execute function public.tg_value_match();

revoke execute on function public.refresh_player_value(text), public.refresh_all_values(), public.compute_player_value(text) from public, anon, authenticated;
revoke execute on function public.value_factors(text), public.daily_value_refresh() from public;
grant execute on function public.value_factors(text), public.daily_value_refresh() to anon, authenticated;

-- Baseline: compute everyone now (records today's history row).
select public.refresh_all_values();
insert into public.app_state (key, value) values ('values_refreshed_on', public.vn_today()::text)
on conflict (key) do update set value = excluded.value;
-- Tournaments (S5 / S7), random group / bracket draw, awards (team + player history), team cover photos.
-- Everything is publicly readable; only admins write (RLS + draw RPC). Team staff may set their team's cover.

create table if not exists public.tournaments (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(btrim(name)) between 1 and 80),
  format      text not null default 's7' check (format in ('s5', 's7')),
  structure   text not null default 'league' check (structure in ('league', 'groups', 'knockout')),
  group_count int  not null default 2 check (group_count between 1 and 8),
  status      text not null default 'upcoming' check (status in ('upcoming', 'ongoing', 'finished')),
  starts_on   date,
  ends_on     date,
  -- key numbers from the template: weeks, squad, duration, points…  (see src/lib/tournament.ts)
  settings    jsonb not null default '{}',
  -- full rules as Markdown (prefilled from the template, editable)
  rules_md    text not null default '' check (length(rules_md) <= 20000),
  -- knockout bracket: [[{ "home": team|null, "away": team|null }, …] per round]
  bracket     jsonb,
  drawn_at    timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.tournament_teams (
  tournament_id text not null references public.tournaments on delete cascade,
  team_id       text not null references public.teams on delete cascade,
  group_label   text,
  seed          int,
  primary key (tournament_id, team_id)
);

create table if not exists public.tournament_awards (
  id            text primary key default gen_random_uuid()::text,
  tournament_id text not null references public.tournaments on delete cascade,
  kind          text not null check (kind in ('champion', 'runner_up', 'top_scorer', 'top_assist', 'mvp', 'golden_glove', 'attendance', 'custom')),
  title         text not null check (length(btrim(title)) between 1 and 80),
  team_id       text references public.teams on delete set null,     -- the winning team, or the player's team at the time
  player_id     text references public.players on delete set null,
  player_name   text,                                                -- kept if the player is deleted later
  note          text check (length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index if not exists tournament_awards_player_idx on public.tournament_awards (player_id);
create index if not exists tournament_awards_team_idx on public.tournament_awards (team_id);

alter table public.matches add column if not exists tournament_id text references public.tournaments on delete set null;
alter table public.matches add column if not exists stage text check (length(stage) <= 40);
alter table public.match_series add column if not exists tournament_id text references public.tournaments on delete set null;
alter table public.teams add column if not exists cover_url text;
grant update (cover_url) on public.teams to authenticated;

-- ───────── RLS ─────────
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_awards enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_teams', 'tournament_awards'] loop
    execute format('drop policy if exists "%1$s: public read" on public.%1$s', t);
    execute format('drop policy if exists "%1$s: admin write" on public.%1$s', t);
    execute format('create policy "%1$s: public read" on public.%1$s for select using (true)', t);
    execute format('create policy "%1$s: admin write" on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke insert, update, delete on public.%1$s from anon', t);
  end loop;
end $$;

-- ───────── draw ─────────
-- Randomly assign groups (groups) or build a first-round bracket padded with byes (knockout). League: seeds only.
create or replace function public.draw_tournament(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  ids text[];
  n int; g int; size int; i int;
  round1 jsonb := '[]'::jsonb;
  rounds jsonb := '[]'::jsonb;
  slots int;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được bốc thăm.'; end if;
  select * into t from public.tournaments where id = p_id for update;
  if not found then raise exception 'Không tìm thấy giải đấu.'; end if;
  select array_agg(team_id order by random()) into ids from public.tournament_teams where tournament_id = p_id;
  n := coalesce(cardinality(ids), 0);
  if n < 2 then raise exception 'Cần ít nhất 2 đội để bốc thăm.'; end if;

  for i in 1..n loop
    update public.tournament_teams set seed = i, group_label = null where tournament_id = p_id and team_id = ids[i];
  end loop;

  if t.structure = 'groups' and n > 2 then
    g := greatest(1, least(t.group_count, n / 2));             -- at least 2 teams per group
    for i in 1..n loop                                          -- snake: A B C C B A …
      update public.tournament_teams
      set group_label = chr(65 + case when ((i - 1) / g) % 2 = 0 then (i - 1) % g else g - 1 - (i - 1) % g end)
      where tournament_id = p_id and team_id = ids[i];
    end loop;
    update public.tournaments set bracket = null, drawn_at = now() where id = p_id;
  elsif t.structure = 'knockout' and n > 2 then
    size := 1; while size < n loop size := size * 2; end loop;
    -- spread byes: top seeds meet an empty slot
    for i in 1..size / 2 loop
      round1 := round1 || jsonb_build_array(jsonb_build_object(
        'home', ids[i],
        'away', case when size - i + 1 <= n then ids[size - i + 1] end));
    end loop;
    rounds := jsonb_build_array(round1);
    slots := size / 4;
    while slots >= 1 loop
      rounds := rounds || jsonb_build_array((select jsonb_agg(jsonb_build_object('home', null, 'away', null)) from generate_series(1, slots)));
      slots := slots / 2;
    end loop;
    update public.tournaments set bracket = rounds, drawn_at = now() where id = p_id;
  else
    update public.tournaments set bracket = null, drawn_at = now() where id = p_id;
  end if;
end $$;

revoke execute on function public.draw_tournament(text) from public, anon;
grant execute on function public.draw_tournament(text) to authenticated;

-- Fixed weekly fixtures keep their tournament / stage.
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
  insert into public.matches (kickoff, home_team, away_team, venue, series_id, tournament_id, stage)
  values (nxt, s.home_team, s.away_team, s.venue, s.id, coalesce(s.tournament_id, last.tournament_id), last.stage)
  on conflict do nothing;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_teams', 'tournament_awards'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- Team chairmen register (or withdraw) their own team while a tournament is still upcoming.
-- Any change to the entry list clears the previous draw; the admin draws again once registration closes.

create or replace function public.register_tournament(p_id text, p_join boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t  public.tournaments;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or me.role <> 'chair' or me.team_id is null then
    raise exception 'Chỉ Chủ tịch đội được đăng ký tham gia giải.';
  end if;
  select * into t from public.tournaments where id = p_id for update;
  if not found then raise exception 'Không tìm thấy giải đấu.'; end if;
  if t.status <> 'upcoming' then raise exception 'Giải đã khởi tranh, không thể thay đổi đăng ký.'; end if;

  if p_join then
    insert into public.tournament_teams (tournament_id, team_id) values (p_id, me.team_id) on conflict do nothing;
  else
    delete from public.tournament_teams where tournament_id = p_id and team_id = me.team_id;
  end if;

  update public.tournament_teams set group_label = null, seed = null where tournament_id = p_id;
  update public.tournaments set bracket = null, drawn_at = null where id = p_id;
end $$;

revoke execute on function public.register_tournament(text, boolean) from public, anon;
grant execute on function public.register_tournament(text, boolean) to authenticated;
-- Man of the Match: picked after the final whistle by the admin or the chairman of either team.
alter table public.matches add column if not exists mom_player text references public.players on delete set null;

create or replace function public.set_mom(p_match text, p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Không tìm thấy trận đấu.'; end if;
  if not (public.is_admin() or public.is_chair_of(m.home_team) or public.is_chair_of(m.away_team)) then
    raise exception 'Chỉ Ban tổ chức hoặc Chủ tịch của hai đội được chọn MOM.';
  end if;
  if m.status <> 'done' then raise exception 'Chỉ chọn MOM khi trận đã kết thúc.'; end if;
  if p_player is not null and not exists (
    select 1 from public.match_players where match_id = p_match and player_id = p_player
    union all
    select 1 from public.players where id = p_player and team_id in (m.home_team, m.away_team)
  ) then
    raise exception 'Cầu thủ này không thi đấu trận này.';
  end if;
  update public.matches set mom_player = p_player where id = p_match;
end $$;

revoke execute on function public.set_mom(text, text) from public, anon;
grant execute on function public.set_mom(text, text) to authenticated;
-- Self rename (at most once every 24 hours) and admin "delete user".

alter table public.profiles add column if not exists name_changed_at timestamptz;

-- The new name also goes on the player card and on the team card (chairman / BHL).
create or replace function public.set_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  next_at timestamptz;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Bạn cần đăng nhập.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 40 then raise exception 'Tên phải từ 2 đến 40 ký tự.'; end if;
  if nm = me.name then raise exception 'Tên mới trùng với tên hiện tại.'; end if;
  next_at := me.name_changed_at + interval '24 hours';
  if next_at > now() then
    raise exception 'Bạn chỉ được đổi tên 1 lần mỗi 24 giờ. Thử lại sau % ngày %.',
      to_char(next_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'), to_char(next_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM');
  end if;

  update public.profiles set name = nm, name_changed_at = now() where id = me.id;
  update public.players set name = nm where user_id = me.id;
  if me.team_id is not null and me.role = 'chair' then
    update public.teams set chair_name = nm where id = me.team_id and chair_name = me.name;
  elsif me.team_id is not null and me.role = 'coach' then
    update public.teams set coach_name = nm where id = me.team_id and coach_name = me.name;
  end if;
end $$;

revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;

-- Admin: remove an account for good (login + profile). The player card is kept as a normal
-- (unlinked) player unless p_delete_player is true.
create or replace function public.delete_user(p_user uuid, p_delete_player boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  u public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được xóa tài khoản.'; end if;
  if p_user = auth.uid() then raise exception 'Bạn không thể tự xóa tài khoản của mình.'; end if;
  select * into u from public.profiles where id = p_user;
  if not found then raise exception 'Không tìm thấy tài khoản.'; end if;

  if u.team_id is not null and u.role = 'chair' then
    update public.teams set chair_name = 'Chưa bổ nhiệm' where id = u.team_id and chair_name = u.name;
  elsif u.team_id is not null and u.role = 'coach' then
    update public.teams set coach_name = coalesce((select name from public.profiles where role = 'coach' and team_id = u.team_id and id <> u.id limit 1), 'Chưa bổ nhiệm')
    where id = u.team_id and coach_name = u.name;
  end if;

  if p_delete_player then
    delete from public.players where user_id = p_user;
  end if;
  delete from auth.users where id = p_user;          -- cascades to profiles; players.user_id → null
end $$;

revoke execute on function public.delete_user(uuid, boolean) from public, anon;
grant execute on function public.delete_user(uuid, boolean) to authenticated;
-- Free agents apply to join a team; that team's chairman (or an admin) accepts or rejects.

create table if not exists public.team_applications (
  id          text primary key default gen_random_uuid()::text,
  player_id   text not null references public.players on delete cascade,
  team_id     text not null references public.teams on delete cascade,
  message     text check (length(message) <= 200),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles on delete set null
);
create unique index if not exists team_applications_one_pending on public.team_applications (player_id, team_id) where status = 'pending';
create index if not exists team_applications_team_idx on public.team_applications (team_id, status);

alter table public.team_applications enable row level security;
drop policy if exists "team_applications: members read" on public.team_applications;
create policy "team_applications: members read" on public.team_applications for select to authenticated using (true);
revoke insert, update, delete on public.team_applications from anon, authenticated;

create or replace function public.apply_team(p_team text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where user_id = auth.uid() for update;
  if not found then raise exception 'Bạn chưa có hồ sơ cầu thủ. Hãy chờ Ban tổ chức duyệt.'; end if;
  if p.team_id is not null then raise exception 'Chỉ cầu thủ tự do mới ứng tuyển được.'; end if;
  if public.is_staff_player(p.id) then raise exception 'Chủ tịch / BHL không thể ứng tuyển đội khác.'; end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'Không tìm thấy đội.'; end if;
  if exists (select 1 from public.team_applications where player_id = p.id and team_id = p_team and status = 'pending') then
    raise exception 'Bạn đã ứng tuyển đội này, đang chờ Chủ tịch duyệt.';
  end if;
  if (select count(*) from public.team_applications where player_id = p.id and status = 'pending') >= 3 then
    raise exception 'Bạn chỉ được chờ duyệt tối đa 3 đơn cùng lúc.';
  end if;
  insert into public.team_applications (player_id, team_id, message)
  values (p.id, p_team, nullif(btrim(coalesce(p_message, '')), ''));
end $$;

create or replace function public.cancel_application(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.team_applications;
begin
  select * into a from public.team_applications where id = p_id for update;
  if not found or a.status <> 'pending' then raise exception 'Đơn không còn hiệu lực.'; end if;
  if not exists (select 1 from public.players where id = a.player_id and user_id = auth.uid()) then
    raise exception 'Chỉ người gửi được rút đơn.';
  end if;
  update public.team_applications set status = 'cancelled', decided_at = now() where id = a.id;
end $$;

create or replace function public.respond_application(p_id text, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  a public.team_applications;
  p public.players;
  tname text;
begin
  select * into a from public.team_applications where id = p_id for update;
  if not found or a.status <> 'pending' then raise exception 'Đơn không còn hiệu lực.'; end if;
  if not (public.is_admin() or public.is_chair_of(a.team_id)) then raise exception 'Chỉ Chủ tịch đội được duyệt đơn ứng tuyển.'; end if;
  select * into p from public.players where id = a.player_id for update;
  select name into tname from public.teams where id = a.team_id;

  if not p_accept then
    update public.team_applications set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = a.id;
    return 'Đã từ chối đơn của ' || p.name;
  end if;
  if p.team_id is not null then
    update public.team_applications set status = 'cancelled', decided_at = now() where id = a.id;
    return p.name || ' đã có đội, đơn tự hủy';
  end if;

  update public.team_applications set status = 'accepted', decided_at = now(), decided_by = auth.uid() where id = a.id;
  update public.players set team_id = a.team_id where id = p.id;       -- trigger below cancels the other pending applications
  insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (p.id, p.name, null, a.team_id, 0);
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
  return 'Chào mừng ' || p.name || ' gia nhập ' || tname || '!';
end $$;

-- Whenever a free agent joins a team (application, invitation, admin move…), their other pending applications lapse.
create or replace function public.lapse_applications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is not null and old.team_id is distinct from new.team_id then
    update public.team_applications set status = 'cancelled', decided_at = now()
    where player_id = new.id and status = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists on_player_team_lapse_apps on public.players;
create trigger on_player_team_lapse_apps after update of team_id on public.players
  for each row execute function public.lapse_applications();

revoke execute on function public.apply_team(text, text), public.cancel_application(text), public.respond_application(text, boolean) from public, anon;
grant execute on function public.apply_team(text, text), public.cancel_application(text), public.respond_application(text, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_applications') then
    alter publication supabase_realtime add table public.team_applications;
  end if;
end $$;
-- Saved starting lineups per team and format (S5 / S7), built by the team's chairman / BHL.
-- slots: [{ "pid": "<player id>" | null, "x": 0–100, "y": 0–100 }] — x/y are % of the team's own half-pitch
-- view (own goal at the bottom). Empty slots (pid null) are allowed.

create table if not exists public.team_lineups (
  team_id    text not null references public.teams on delete cascade,
  format     text not null check (format in ('s5', 's7')),
  formation  text not null check (length(formation) between 1 and 20),
  slots      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles on delete set null,
  primary key (team_id, format)
);

alter table public.team_lineups enable row level security;
drop policy if exists "team_lineups: public read" on public.team_lineups;
create policy "team_lineups: public read" on public.team_lineups for select using (true);
revoke insert, update, delete on public.team_lineups from anon, authenticated;

create or replace function public.save_lineup(p_team text, p_format text, p_formation text, p_slots jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  n int;
  s jsonb;
  pids text[] := '{}';
  pid text;
  clean jsonb := '[]'::jsonb;
begin
  if not public.can_manage_team(p_team) then raise exception 'Chỉ Chủ tịch, BHL của đội hoặc Ban tổ chức được xếp đội hình.'; end if;
  if p_format not in ('s5', 's7') then raise exception 'Chế độ sân không hợp lệ.'; end if;
  if jsonb_typeof(p_slots) <> 'array' then raise exception 'Đội hình không hợp lệ.'; end if;
  n := jsonb_array_length(p_slots);
  if n <> (case p_format when 's5' then 5 else 7 end) then raise exception 'Số vị trí không khớp với sân %.', substr(p_format, 2); end if;

  for s in select * from jsonb_array_elements(p_slots) loop
    pid := nullif(s ->> 'pid', '');
    if pid is not null then
      if pid = any(pids) then raise exception 'Một cầu thủ chỉ đứng 1 vị trí.'; end if;
      if not exists (select 1 from public.players where id = pid and team_id = p_team) then
        raise exception 'Chỉ xếp được cầu thủ trong đội.';
      end if;
      pids := pids || pid;
    end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'pid', pid,
      'x', greatest(0, least(100, coalesce((s ->> 'x')::numeric, 50))),
      'y', greatest(0, least(100, coalesce((s ->> 'y')::numeric, 50)))));
  end loop;

  insert into public.team_lineups (team_id, format, formation, slots, updated_at, updated_by)
  values (p_team, p_format, btrim(p_formation), clean, now(), auth.uid())
  on conflict (team_id, format) do update
    set formation = excluded.formation, slots = excluded.slots, updated_at = now(), updated_by = auth.uid();
end $$;

revoke execute on function public.save_lineup(text, text, text, jsonb) from public, anon;
grant execute on function public.save_lineup(text, text, text, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_lineups') then
    alter publication supabase_realtime add table public.team_lineups;
  end if;
end $$;
-- Experience points (XP) → stat growth, earned like quests after every finished match.
--
--  * Every XP event is split over the six stats (by position weight, or to specific stats: goals → SHO…).
--  * Each stat has its own progress; +1 point costs xp_cost(current value), which grows ~10% per point,
--    so high stats are much harder to raise (60 → 12 XP, 75 → 50 XP, 85 → 130 XP, 95 → 337 XP).
--  * Penalties only eat progress — a stat never drops.
--  * Events are unique per (player, match, kind): re-running is safe and nothing is counted twice.
--  Mirrors src/lib/xp.ts (rules table shown in the app).

alter table public.players add column if not exists xp int not null default 0;
alter table public.players add column if not exists stat_xp int[] not null default '{0,0,0,0,0,0}';

create table if not exists public.player_xp (
  id          bigint generated always as identity primary key,
  player_id   text not null references public.players on delete cascade,
  match_id    text references public.matches on delete cascade,
  kind        text not null,
  amount      int not null,
  dist        int[] not null,
  note        text,
  created_by  uuid references public.profiles on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists player_xp_once on public.player_xp (player_id, match_id, kind) where match_id is not null;
create index if not exists player_xp_player_idx on public.player_xp (player_id, created_at desc);

alter table public.player_xp enable row level security;
drop policy if exists "player_xp: members read" on public.player_xp;
create policy "player_xp: members read" on public.player_xp for select to authenticated using (true);
revoke insert, update, delete on public.player_xp from anon, authenticated;

-- XP needed for +1 on a stat that is currently v.
create or replace function public.xp_cost(v int) returns int
language sql immutable as $$ select greatest(5, round(12 * power(1.1, v - 60))::int) $$;

create or replace function public.pos_weights(p_pos text) returns numeric[]
language sql immutable as $$
  select case p_pos
    when 'ST'  then array[.25, .35, .08, .17, .00, .15]
    when 'LW'  then array[.30, .22, .15, .25, .00, .08]
    when 'RW'  then array[.30, .22, .15, .25, .00, .08]
    when 'CAM' then array[.12, .20, .30, .30, .00, .08]
    when 'CM'  then array[.10, .10, .35, .20, .12, .13]
    when 'CDM' then array[.08, .03, .25, .10, .32, .22]
    when 'LB'  then array[.28, .00, .17, .13, .27, .15]
    when 'RB'  then array[.28, .00, .17, .13, .27, .15]
    when 'CB'  then array[.12, .00, .10, .05, .45, .28]
    when 'GK'  then array[.23, .22, .08, .27, .05, .15]
    else array[1/6.0, 1/6.0, 1/6.0, 1/6.0, 1/6.0, 1/6.0] end::numeric[]
$$;

-- "General" XP follows the position weights (a striker's attendance mostly trains SHO / PAC).
create or replace function public.xp_split(p_pos text, p_amount int) returns int[]
language plpgsql immutable as $$
declare
  w numeric[] := public.pos_weights(p_pos);
  d int[] := array[0, 0, 0, 0, 0, 0];
  i int; top int := 1;
begin
  for i in 1..6 loop
    d[i] := trunc(p_amount * w[i])::int;
    if w[i] > w[top] then top := i; end if;
  end loop;
  -- the rounding remainder goes to the position's main stat, so the total is exact
  d[top] := d[top] + p_amount - (d[1] + d[2] + d[3] + d[4] + d[5] + d[6]);
  return d;
end $$;

create or replace function public.pos_group(p_pos text) returns text
language sql immutable as $$
  select case when p_pos = 'GK' then 'GK' when p_pos in ('CB', 'LB', 'RB') then 'DEF'
              when p_pos in ('CDM', 'CM', 'CAM') then 'MID' else 'FWD' end
$$;

-- Add XP to each stat's progress and level stats up while progress covers the cost.
create or replace function public.apply_xp(p_player text, p_dist int[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  p public.players;
  s int[]; prog int[];
  i int; c int;
begin
  select * into p from public.players where id = p_player for update;
  if not found then return; end if;
  s := p.stats;
  prog := coalesce(p.stat_xp, '{0,0,0,0,0,0}');
  for i in 1..6 loop
    prog[i] := greatest(0, coalesce(prog[i], 0) + coalesce(p_dist[i], 0));
    loop
      c := public.xp_cost(s[i]);
      exit when s[i] >= 99 or prog[i] < c;
      prog[i] := prog[i] - c;
      s[i] := s[i] + 1;
    end loop;
    if s[i] >= 99 then prog[i] := 0; end if;
  end loop;
  update public.players
  set stats = s, stat_xp = prog,
      xp = greatest(0, xp + (select coalesce(sum(x), 0) from unnest(p_dist) x)::int)
  where id = p_player;
end $$;

-- Record one XP event (once per player / match / kind) and apply it.
create or replace function public.grant_xp(p_player text, p_match text, p_kind text, p_dist int[], p_note text, p_by uuid default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare total int := (select coalesce(sum(x), 0) from unnest(p_dist) x)::int;
begin
  if total = 0 then return false; end if;
  insert into public.player_xp (player_id, match_id, kind, amount, dist, note, created_by)
  values (p_player, p_match, p_kind, total, p_dist, p_note, p_by)
  on conflict do nothing;
  if not found then return false; end if;
  perform public.apply_xp(p_player, p_dist);
  return true;
end $$;

-- All XP of a finished match. Idempotent: call it again whenever stats are approved, MOM is picked…
create or replace function public.refresh_match_xp(p_match text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  r record;
  pl public.players;
  g text; gk boolean;
  gf int; ga int; goals int; assists int; saves int;
  side text; streak int; t text; regs int;
begin
  select * into m from public.matches where id = p_match;
  if not found or m.status <> 'done' then return; end if;

  -- Everyone who played: registered players + anyone on the admin's scorer list.
  for r in
    select mp.player_id, mp.team_id, mp.goals, mp.assists, mp.saves, mp.rating, mp.stats_status
    from public.match_players mp where mp.match_id = m.id
    union
    select sc.pid, case when sc.side = 'home' then m.home_team else m.away_team end, null, null, null, null, 'none'
    from (select distinct s ->> 'pid' as pid, s ->> 'side' as side from jsonb_array_elements(m.scorers) s) sc
    where sc.pid is not null and not exists (select 1 from public.match_players x where x.match_id = m.id and x.player_id = sc.pid)
  loop
    select * into pl from public.players where id = r.player_id;
    continue when not found;
    g := public.pos_group(pl.pos); gk := g = 'GK';
    side := case when r.team_id = m.home_team then 'home' else 'away' end;
    gf := case when side = 'home' then m.home_score else m.away_score end;
    ga := case when side = 'home' then m.away_score else m.home_score end;
    goals := greatest(
      (select count(*) from jsonb_array_elements(m.scorers) s where s ->> 'pid' = pl.id)::int,
      case when r.stats_status = 'approved' then coalesce(r.goals, 0) else 0 end);
    assists := case when r.stats_status = 'approved' then coalesce(r.assists, 0) else 0 end;
    saves := case when r.stats_status = 'approved' then least(coalesce(r.saves, 0), 10) else 0 end;

    perform public.grant_xp(pl.id, m.id, 'attend', public.xp_split(pl.pos, 20), 'Có mặt thi đấu');
    if r.stats_status = 'approved' then
      perform public.grant_xp(pl.id, m.id, 'stats', public.xp_split(pl.pos, 10), 'Điền thông số, BHL đã duyệt');
    end if;
    if gf > ga then perform public.grant_xp(pl.id, m.id, 'win', public.xp_split(pl.pos, 8), 'Thắng trận');
    elsif gf = ga then perform public.grant_xp(pl.id, m.id, 'draw', public.xp_split(pl.pos, 4), 'Hòa');
    end if;
    if goals > 0 then
      perform public.grant_xp(pl.id, m.id, 'goals',
        case when gk then array[0, 0, 16 * goals, 0, 0, 0] else array[0, 12 * goals, 0, 4 * goals, 0, 0] end, goals || ' bàn thắng');
    end if;
    if assists > 0 then
      perform public.grant_xp(pl.id, m.id, 'assists',
        case when gk then array[0, 0, 16 * assists, 0, 0, 0] else array[0, 0, 12 * assists, 4 * assists, 0, 0] end, assists || ' kiến tạo');
    end if;
    if ga = 0 then
      perform public.grant_xp(pl.id, m.id, 'clean_sheet',
        case g when 'GK' then array[5, 5, 0, 5, 0, 5] when 'DEF' then array[0, 0, 0, 0, 15, 5] when 'MID' then array[0, 0, 0, 0, 6, 0] else array[0, 0, 0, 0, 0, 0] end,
        'Giữ sạch lưới');
    elsif ga = 1 and g in ('GK', 'DEF') then
      perform public.grant_xp(pl.id, m.id, 'tight', case when gk then array[2, 2, 0, 2, 0, 0] else array[0, 0, 0, 0, 6, 0] end, 'Chỉ thủng lưới 1 bàn');
    end if;
    if saves > 0 and gk then
      perform public.grant_xp(pl.id, m.id, 'saves', array[(3 * saves + 1) / 2, 0, 0, (3 * saves) / 2, 0, 0], saves || ' pha cản phá');
    end if;
    if r.stats_status = 'approved' and r.rating >= 9 then
      perform public.grant_xp(pl.id, m.id, 'rating', public.xp_split(pl.pos, 20), 'Điểm trận ≥ 9');
    elsif r.stats_status = 'approved' and r.rating >= 8 then
      perform public.grant_xp(pl.id, m.id, 'rating', public.xp_split(pl.pos, 10), 'Điểm trận ≥ 8');
    end if;
    if m.mom_player = pl.id then
      perform public.grant_xp(pl.id, m.id, 'mom', public.xp_split(pl.pos, 25), 'Cầu thủ xuất sắc trận (MOM)');
    end if;
    -- Streak: played the team's last 3 finished matches (this one included).
    select count(*) into streak from (
      select x.id from public.matches x
      where x.status = 'done' and r.team_id in (x.home_team, x.away_team) and x.kickoff <= m.kickoff
      order by x.kickoff desc limit 3) last3
    where exists (select 1 from public.match_players y where y.match_id = last3.id and y.player_id = pl.id);
    if streak = 3 then
      perform public.grant_xp(pl.id, m.id, 'streak', public.xp_split(pl.pos, 15), 'Chuỗi 3 trận liên tiếp có mặt');
    end if;
  end loop;

  -- Skipping your own team's match (only when the team actually used "Tham gia": ≥ 3 registrations).
  foreach t in array array[m.home_team, m.away_team] loop
    select count(*) into regs from public.match_players where match_id = m.id and team_id = t;
    continue when regs < 3;
    for pl in
      select p.* from public.players p
      where p.team_id = t
        and not exists (select 1 from public.match_players y where y.match_id = m.id and y.player_id = p.id)
        and not exists (select 1 from jsonb_array_elements(m.scorers) s where s ->> 'pid' = p.id)
    loop
      perform public.grant_xp(pl.id, m.id, 'absent', public.xp_split(pl.pos, -6), 'Vắng trận của đội');
    end loop;
  end loop;
end $$;

create or replace function public.tg_match_xp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'matches' then
    if new.status = 'done' then perform public.refresh_match_xp(new.id); end if;
  else
    perform public.refresh_match_xp(new.match_id);
  end if;
  return new;
end $$;

drop trigger if exists on_match_xp on public.matches;
create trigger on_match_xp after update of status, home_score, away_score, mom_player, scorers on public.matches
  for each row execute function public.tg_match_xp();
drop trigger if exists on_match_player_xp on public.match_players;
create trigger on_match_player_xp after update of stats_status on public.match_players
  for each row when (new.stats_status = 'approved') execute function public.tg_match_xp();

-- "Thưởng nóng": a chairman gives one envelope (+30 XP) per week to a player of their own team.
create or replace function public.hot_bonus(p_player text) returns text
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where id = p_player;
  if not found then raise exception 'Không tìm thấy cầu thủ.'; end if;
  if not (public.is_admin() or (p.team_id is not null and public.is_chair_of(p.team_id))) then
    raise exception 'Chỉ Chủ tịch của đội mới được thưởng nóng.';
  end if;
  if p.user_id = auth.uid() then raise exception 'Tự thưởng cho mình thì… hơi kỳ. Nhờ người khác nhé 😅'; end if;
  if exists (select 1 from public.player_xp where kind = 'bonus' and created_by = auth.uid()
             and created_at >= date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh') then
    raise exception 'Tuần này bạn đã phát phong bì rồi. Hẹn tuần sau!';
  end if;
  perform public.grant_xp(p.id, null, 'bonus', public.xp_split(p.pos, 30), 'Thưởng nóng từ Chủ tịch 🧧', auth.uid());
  return 'Đã thưởng nóng +30 XP cho ' || p.name;
end $$;

revoke execute on function public.apply_xp(text, int[]), public.grant_xp(text, text, text, int[], text, uuid), public.refresh_match_xp(text) from public, anon, authenticated;
revoke execute on function public.hot_bonus(text) from public, anon;
grant execute on function public.hot_bonus(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'player_xp') then
    alter publication supabase_realtime add table public.player_xp;
  end if;
end $$;
-- Every new player starts at the same floor: random stats shaped by the primary position,
-- landing on an OVR between 72 and 78 (same recipe as supabase/reset-stats-75.sql). Stats typed
-- in the "add player" / "approve" forms are ignored on insert; growth comes from XP afterwards.

create or replace function public.starter_stats(p_pos text) returns int[]
language plpgsql volatile as $$
declare
  w numeric[] := public.pos_weights(p_pos);
  s int[] := array[0, 0, 0, 0, 0, 0];
  target int := 72 + floor(random() * 7)::int;                       -- 72..78
  cur int; i int; tries int := 0;
begin
  for i in 1..6 loop
    -- stats the position relies on come out higher, the others lower, plus a little noise
    s[i] := greatest(40, least(92, round(target + (w[i] - 1 / 6.0) * 60 + (random() * 8 - 4))::int));
  end loop;
  loop                                                                -- nudge until OVR = target
    cur := public.compute_ovr(p_pos, s);
    exit when cur = target or tries > 30;
    for i in 1..6 loop s[i] := greatest(40, least(95, s[i] + sign(target - cur)::int)); end loop;
    tries := tries + 1;
  end loop;
  return s;
end $$;

create or replace function public.players_starter() returns trigger
language plpgsql as $$
begin
  new.stats := public.starter_stats(coalesce(new.positions[1], new.pos));
  new.stat_xp := '{0,0,0,0,0,0}';
  new.xp := 0;
  return new;
end $$;

-- Name sorts before "players_derive", so OVR is computed from the starter stats.
drop trigger if exists players_0_starter on public.players;
create trigger players_0_starter before insert on public.players
  for each row execute function public.players_starter();
-- In-app notifications, generated by the database:
--   * a new match → players of both teams (+ free agents, + the teams' staff): "bấm Tham gia"
--   * a new tournament → every approved member
--   * XP / stat changes → one notification per match (or per bonus), updated as XP keeps coming in
--   * team application accepted / rejected → the applicant

create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles on delete cascade,
  kind        text not null,                  -- match | tournament | xp | application
  ref         text not null,                  -- de-dupe key per user, e.g. "match:<id>", "xp:<match id>"
  title       text not null,
  body        text,
  link        text,                           -- hash route, e.g. "#/match/<id>"
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  unique (user_id, ref)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notifications: own read" on public.notifications;
create policy "notifications: own read" on public.notifications for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;

create or replace function public.vn_when(t timestamptz) returns text
language sql stable as $$
  select (array['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'])[extract(dow from t at time zone 'Asia/Ho_Chi_Minh')::int + 1]
    || ' ' || to_char(t at time zone 'Asia/Ho_Chi_Minh', 'DD/MM · HH24:MI')
$$;

create or replace function public.mark_notifications_read(p_ids bigint[] default null) returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids))
$$;
revoke execute on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;

-- ───────── new match ─────────
create or replace function public.notify_new_match() returns trigger
language plpgsql security definer set search_path = public as $$
declare h text; a text;
begin
  if new.status <> 'up' then return new; end if;
  select short into h from public.teams where id = new.home_team;
  select short into a from public.teams where id = new.away_team;
  insert into public.notifications (user_id, kind, ref, title, body, link)
  select distinct u.id, 'match', 'match:' || new.id,
    '⚽ Trận mới: ' || h || ' vs ' || a,
    public.vn_when(new.kickoff) || ' · ' || new.venue || ' — bấm “Tham gia” để điểm danh (+20 XP)',
    '#/match/' || new.id
  from public.profiles u
  where u.role <> 'pending' and (
    exists (select 1 from public.players p where p.user_id = u.id and (p.team_id in (new.home_team, new.away_team) or p.team_id is null))
    or (u.role in ('chair', 'coach') and u.team_id in (new.home_team, new.away_team)))
  on conflict (user_id, ref) do nothing;
  return new;
end $$;
drop trigger if exists on_match_notify on public.matches;
create trigger on_match_notify after insert on public.matches for each row execute function public.notify_new_match();

-- ───────── new tournament ─────────
create or replace function public.notify_new_tournament() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, ref, title, body, link)
  select u.id, 'tournament', 'tour:' || new.id,
    '🏆 Giải đấu mới: ' || new.name,
    case new.format when 's5' then 'Sân 5' else 'Sân 7' end
      || coalesce(' · khai mạc ' || to_char(new.starts_on, 'DD/MM'), '')
      || case when u.role = 'chair' then ' — Chủ tịch bấm “Đăng ký tham gia” trên banner.' else ' — xem thể lệ và giải thưởng.' end,
    '#/tournament/' || new.id
  from public.profiles u where u.role <> 'pending'
  on conflict (user_id, ref) do nothing;
  return new;
end $$;
drop trigger if exists on_tournament_notify on public.tournaments;
create trigger on_tournament_notify after insert on public.tournaments for each row execute function public.notify_new_tournament();

-- ───────── application decided ─────────
create or replace function public.notify_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid; t text;
begin
  if new.status not in ('accepted', 'rejected') or old.status = new.status then return new; end if;
  select user_id into u from public.players where id = new.player_id;
  if u is null then return new; end if;
  select name into t from public.teams where id = new.team_id;
  insert into public.notifications (user_id, kind, ref, title, body, link)
  values (u, 'application', 'app:' || new.id,
    case when new.status = 'accepted' then '🎉 ' || t || ' đã nhận bạn vào đội!' else '📭 ' || t || ' chưa nhận đơn của bạn' end,
    case when new.status = 'accepted' then 'Chào mừng gia nhập. Xem đội hình và trận tới nhé.' else 'Đừng nản, thử ứng tuyển đội khác hoặc chờ lời mời.' end,
    '#/teams/' || new.team_id)
  on conflict (user_id, ref) do update set title = excluded.title, body = excluded.body, created_at = now(), read_at = null;
  return new;
end $$;
drop trigger if exists on_application_notify on public.team_applications;
create trigger on_application_notify after update of status on public.team_applications for each row execute function public.notify_application();

-- ───────── XP / stats ─────────
-- grant_xp now also reports stats that went up, into one notification per match (or per bonus).
create or replace function public.grant_xp(p_player text, p_match text, p_kind text, p_dist int[], p_note text, p_by uuid default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  total int := (select coalesce(sum(x), 0) from unnest(p_dist) x)::int;
  before int[]; after int[]; pl public.players;
  ups jsonb := '[]'; i int; lbl text[]; eid bigint;
  mt public.matches; h text; a text; v_title text; v_ref text;
begin
  if total = 0 then return false; end if;
  insert into public.player_xp (player_id, match_id, kind, amount, dist, note, created_by)
  values (p_player, p_match, p_kind, total, p_dist, p_note, p_by)
  on conflict do nothing
  returning id into eid;
  if eid is null then return false; end if;
  select stats into before from public.players where id = p_player;
  perform public.apply_xp(p_player, p_dist);
  select * into pl from public.players where id = p_player;
  after := pl.stats;
  if pl.user_id is null then return true; end if;

  lbl := case when pl.pos = 'GK' then array['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] else array['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] end;
  for i in 1..6 loop
    if after[i] > before[i] then ups := ups || to_jsonb(lbl[i] || ' ' || before[i] || '→' || after[i]); end if;
  end loop;

  if p_match is not null then
    select * into mt from public.matches where id = p_match;
    select short into h from public.teams where id = mt.home_team;
    select short into a from public.teams where id = mt.away_team;
    v_ref := 'xp:' || p_match;
    v_title := 'Kinh nghiệm trận ' || h || ' ' || mt.home_score || '–' || mt.away_score || ' ' || a;
  else
    v_ref := 'xp:' || p_kind || ':' || eid;
    v_title := case when p_kind = 'bonus' then '🧧 Chủ tịch thưởng nóng cho bạn' else 'Kinh nghiệm' end;
  end if;

  insert into public.notifications (user_id, kind, ref, title, link, meta)
  values (pl.user_id, 'xp', v_ref, v_title, case when p_match is not null then '#/match/' || p_match end,
    jsonb_build_object('xp', total, 'notes', jsonb_build_array(p_note), 'ups', ups))
  on conflict (user_id, ref) do update set
    meta = jsonb_build_object(
      'xp', coalesce((public.notifications.meta ->> 'xp')::int, 0) + total,
      'notes', coalesce(public.notifications.meta -> 'notes', '[]') || jsonb_build_array(p_note),
      'ups', coalesce(public.notifications.meta -> 'ups', '[]') || ups),
    created_at = now(), read_at = null;
  return true;
end $$;
revoke execute on function public.grant_xp(text, text, text, int[], text, uuid) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
-- Starting teams. Players, fixtures and people are entered through the app.
insert into public.teams (id, name, short, color, color2, motto, founded, chair_quote) values
  ('f8', 'F8 Warriors', 'F8', '#ff3b5c', '#7a0f24', 'Không lùi bước, máu lửa từ phút đầu tiên', 2024, 'Chơi hết mình, thắng bằng tinh thần.'),
  ('f9', 'F9 Titans',   'F9', '#2f8cff', '#0b2a66', 'Kỷ luật tạo nên chiến thắng',              2024, 'Mỗi trận là một bài test hệ thống.')
on conflict (id) do nothing;
