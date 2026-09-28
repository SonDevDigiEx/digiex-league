-- "Bận": a player answers that they can't make it. Declaring it before kickoff counts as an excused absence
-- (no −6 absence penalty) and tells the chairman they have seen the match. Joining and being busy are exclusive.

create table if not exists public.match_busy (
  match_id   text not null references public.matches on delete cascade,
  player_id  text not null references public.players on delete cascade,
  team_id    text references public.teams on delete set null,     -- the player's team at the time (null = free agent)
  reason     text check (length(reason) <= 120),
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

alter table public.match_busy enable row level security;
drop policy if exists "match_busy: public read" on public.match_busy;
create policy "match_busy: public read" on public.match_busy for select using (true);
revoke insert, update, delete on public.match_busy from anon, authenticated;

create or replace function public.set_busy(p_match text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.matches; p public.players;
begin
  if not public.is_approved() then raise exception 'Tài khoản của bạn đang chờ Ban tổ chức duyệt.'; end if;
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Không tìm thấy trận.'; end if;
  if m.status <> 'up' or m.kickoff <= now() then raise exception 'Trận đã bắt đầu — không thể báo bận nữa.'; end if;
  if p.team_id is not null and p.team_id not in (m.home_team, m.away_team) then raise exception 'Đội của bạn không thi đấu trận này.'; end if;
  delete from public.match_players where match_id = m.id and player_id = p.id;
  insert into public.match_busy (match_id, player_id, team_id, reason)
  values (m.id, p.id, p.team_id, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (match_id, player_id) do update set reason = excluded.reason, team_id = excluded.team_id, created_at = now();
end $$;

create or replace function public.clear_busy(p_match text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  if not exists (select 1 from public.matches where id = p_match and status = 'up' and kickoff > now()) then
    raise exception 'Trận đã bắt đầu.';
  end if;
  delete from public.match_busy where match_id = p_match and player_id = p.id;
end $$;

-- Joining the match cancels an earlier "Bận".
create or replace function public.clear_busy_on_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.match_busy where match_id = new.match_id and player_id = new.player_id;
  return new;
end $$;
drop trigger if exists on_join_clear_busy on public.match_players;
create trigger on_join_clear_busy after insert on public.match_players for each row execute function public.clear_busy_on_join();

revoke execute on function public.set_busy(text, text), public.clear_busy(text) from public, anon;
grant execute on function public.set_busy(text, text), public.clear_busy(text) to authenticated;

-- Excused (busy) players are not charged the absence penalty.
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
    from public.match_players mp where mp.match_id = m.id and coalesce(mp.attendance, 'present') <> 'no_show'
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
        and not exists (select 1 from public.match_busy b where b.match_id = m.id and b.player_id = p.id)
    loop
      perform public.grant_xp(pl.id, m.id, 'absent', public.xp_split(pl.pos, -6), 'Vắng trận của đội');
    end loop;
  end loop;
end $$;



do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'match_busy') then
    alter publication supabase_realtime add table public.match_busy;
  end if;
end $$;
