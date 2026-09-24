-- DigiEx League: full setup (schema + demo data). Paste into Supabase SQL Editor and Run once.

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

-- Generated by scripts/gen-seed-sql.ts — do not edit by hand.
insert into public.teams (id, name, short, color, color2, motto, founded, chair_name, chair_since, chair_quote, coach_name) values
  ('f8', 'F8 Warriors', 'F8', '#ff3b5c', '#7a0f24', 'Không lùi bước, máu lửa từ phút đầu tiên', 2024, 'Nguyễn Thanh Sơn', '2024', 'Chơi hết mình, thắng bằng tinh thần.', 'Phạm Đức Hùng'),
  ('f9', 'F9 Titans', 'F9', '#2f8cff', '#0b2a66', 'Kỷ luật tạo nên chiến thắng', 2024, 'Lê Quang Vinh', '2024', 'Mỗi trận là một bài test hệ thống.', 'Trần Minh Đạo');

insert into public.players (id, team_id, name, pos, ovr, num, age, foot, stats) values
  ('p0', 'f8', 'Trần Đức Anh', 'GK', 81, 1, 29, 'Phải', '{86,83,72,85,56,78}'),
  ('p1', 'f8', 'Lê Hoàng Nam', 'CB', 79, 4, 31, 'Trái', '{73,52,69,68,82,79}'),
  ('p2', 'f8', 'Phạm Quốc Bảo', 'CB', 76, 5, 27, 'Phải', '{74,48,68,64,82,83}'),
  ('p3', 'f8', 'Vũ Thành Long', 'LB', 74, 3, 25, 'Phải', '{68,45,69,68,82,79}'),
  ('p4', 'f8', 'Đỗ Minh Khoa', 'CDM', 80, 6, 30, 'Phải', '{73,74,82,85,62,75}'),
  ('p5', 'f8', 'Nguyễn Hữu Phúc', 'CM', 83, 8, 28, 'Phải', '{80,76,88,87,68,77}'),
  ('p6', 'f8', 'Bùi Gia Huy', 'CAM', 87, 10, 26, 'Phải', '{80,87,94,89,74,79}'),
  ('p7', 'f8', 'Hoàng Anh Tú', 'RW', 78, 7, 24, 'Phải', '{81,85,70,77,37,76}'),
  ('p8', 'f8', 'Đặng Văn Quyết', 'ST', 91, 9, 27, 'Trái', '{91,97,86,97,44,87}'),
  ('p9', 'f8', 'Ngô Tiến Dũng', 'LW', 72, 11, 23, 'Phải', '{76,76,70,76,28,67}'),
  ('p10', 'f8', 'Lâm Chí Thanh', 'CM', 68, 14, 35, 'Phải', '{62,63,70,71,57,62}'),
  ('p20', 'f9', 'Phan Văn Hậu', 'GK', 83, 1, 32, 'Trái', '{85,85,68,86,58,85}'),
  ('p21', 'f9', 'Trịnh Quang Hải', 'CB', 82, 4, 29, 'Phải', '{80,55,74,70,86,88}'),
  ('p22', 'f9', 'Lý Công Minh', 'CB', 75, 2, 26, 'Phải', '{69,47,69,61,81,79}'),
  ('p23', 'f9', 'Mai Xuân Trường', 'RB', 73, 12, 24, 'Trái', '{63,44,62,66,81,76}'),
  ('p24', 'f9', 'Dương Thế Vinh', 'CDM', 78, 6, 28, 'Phải', '{75,72,82,82,61,70}'),
  ('p25', 'f9', 'Cao Đức Thắng', 'CM', 85, 8, 27, 'Phải', '{79,78,92,88,70,84}'),
  ('p26', 'f9', 'Hồ Tấn Tài', 'CAM', 80, 10, 25, 'Phải', '{78,80,81,81,68,78}'),
  ('p27', 'f9', 'Tô Hoàng Lâm', 'LW', 77, 11, 23, 'Trái', '{77,84,71,75,36,72}'),
  ('p28', 'f9', 'Lương Công Phượng', 'ST', 89, 9, 30, 'Phải', '{93,95,86,94,42,83}'),
  ('p29', 'f9', 'Kiều Nhật Minh', 'RW', 84, 7, 26, 'Phải', '{84,88,76,87,40,76}'),
  ('p30', 'f9', 'Võ Đình Khôi', 'ST', 66, 19, 22, 'Trái', '{70,69,60,67,24,57}');

insert into public.matches (id, kickoff, home_team, away_team, home_score, away_score, status, venue, scorers) values
  ('m0', '2026-01-10T18:00:00+07:00', 'f8', 'f9', 3, 2, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p4","side":"home","min":18},{"pid":"p28","side":"away","min":29},{"pid":"p6","side":"home","min":36},{"pid":"p7","side":"home","min":40},{"pid":"p23","side":"away","min":61}]'),
  ('m1', '2026-02-07T18:00:00+07:00', 'f9', 'f8', 1, 1, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p28","side":"home","min":34},{"pid":"p8","side":"away","min":63}]'),
  ('m2', '2026-03-07T18:00:00+07:00', 'f8', 'f9', 0, 2, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p30","side":"away","min":28},{"pid":"p27","side":"away","min":41}]'),
  ('m3', '2026-04-04T18:00:00+07:00', 'f9', 'f8', 4, 3, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p25","side":"home","min":5},{"pid":"p7","side":"away","min":16},{"pid":"p24","side":"home","min":18},{"pid":"p25","side":"home","min":22},{"pid":"p1","side":"away","min":26},{"pid":"p27","side":"home","min":28},{"pid":"p5","side":"away","min":52}]'),
  ('m4', '2026-05-09T18:30:00+07:00', 'f8', 'f9', 2, 1, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p6","side":"home","min":16},{"pid":"p29","side":"away","min":25},{"pid":"p8","side":"home","min":63}]'),
  ('m5', '2026-06-06T18:30:00+07:00', 'f9', 'f8', 2, 2, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p28","side":"home","min":10},{"pid":"p4","side":"away","min":23},{"pid":"p3","side":"away","min":36},{"pid":"p27","side":"home","min":40}]'),
  ('m6', '2026-07-11T18:30:00+07:00', 'f8', 'f9', 3, 1, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p9","side":"home","min":4},{"pid":"p3","side":"home","min":18},{"pid":"p27","side":"away","min":18},{"pid":"p6","side":"home","min":20}]'),
  ('m7', '2026-08-08T18:30:00+07:00', 'f9', 'f8', 1, 2, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p8","side":"away","min":18},{"pid":"p8","side":"away","min":63},{"pid":"p24","side":"home","min":66}]'),
  ('m8', '2026-09-12T18:30:00+07:00', 'f8', 'f9', 1, 3, 'done', 'Sân bóng Hoàng Mai · Sân số 3', '[{"pid":"p24","side":"away","min":15},{"pid":"p26","side":"away","min":40},{"pid":"p25","side":"away","min":48},{"pid":"p6","side":"home","min":60}]'),
  ('m9', '2026-10-03T19:30:00+07:00', 'f9', 'f8', 0, 0, 'up', 'Sân bóng Hoàng Mai · Sân số 3', '[]');

insert into public.transfers (player_id, player_name, from_team, to_team, fee, created_on) values
  ('p10', 'Lâm Chí Thanh', 'f9', 'f8', 1.2, '2026-06-20'),
  ('p30', 'Võ Đình Khôi', 'f8', 'f9', 0.8, '2026-08-01');
