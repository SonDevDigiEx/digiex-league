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
