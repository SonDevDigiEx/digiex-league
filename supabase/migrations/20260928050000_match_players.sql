-- Match participation (RSVP) and self-reported post-match stats approved by team staff.
-- * Before kickoff a player joins a match: for their own team, or (free agent) for one of the two sides.
-- * After the match the player submits their stats; the side's BHL / chairman (or an admin) approves or rejects.
-- * Only approved rows count towards season stats.

create table public.match_players (
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
create index on public.match_players (player_id);

alter table public.match_players enable row level security;
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
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_players;
  end if;
end $$;
