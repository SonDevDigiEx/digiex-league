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
  public.roll_one_series(text), public.roll_series(), public.on_series_match_closed(), public.create_series(text, text, timestamptz, text), public.cancel_match(text, text) cascade;
drop table if exists public.match_series cascade;
drop trigger if exists on_auth_user_updated on auth.users;
drop table if exists public.bootstrap_admins;

-- ═══ supabase/migrations/20260924000000_init.sql ═══
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

-- ═══ supabase/migrations/20260928000000_production.sql ═══
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

-- ═══ supabase/migrations/20260928010000_approval.sql ═══
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

-- ═══ supabase/migrations/20260928020000_players.sql ═══
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

-- ═══ supabase/migrations/20260928030000_open_signup.sql ═══
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

-- ═══ supabase/migrations/20260928040000_self_photo.sql ═══
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

-- ═══ supabase/migrations/20260928050000_match_players.sql ═══
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

-- ═══ supabase/migrations/20260928060000_offers_v2.sql ═══
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

-- ═══ supabase/migrations/20260928070000_series_cancel.sql ═══
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

-- ═══ supabase/seed.sql ═══
-- Starting teams. Players, fixtures and people are entered through the app.
insert into public.teams (id, name, short, color, color2, motto, founded, chair_quote) values
  ('f8', 'F8 Warriors', 'F8', '#ff3b5c', '#7a0f24', 'Không lùi bước, máu lửa từ phút đầu tiên', 2024, 'Chơi hết mình, thắng bằng tinh thần.'),
  ('f9', 'F9 Titans',   'F9', '#2f8cff', '#0b2a66', 'Kỷ luật tạo nên chiến thắng',              2024, 'Mỗi trận là một bài test hệ thống.')
on conflict (id) do nothing;
