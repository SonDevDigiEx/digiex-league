-- Attendance after the match, marked by the team's chairman (or an admin):
--   present (default) · late → −5 XP · no_show ("điểm danh mà không đến") → loses all XP of that match and −10 more.
-- Marks can be changed; the previous penalty is reversed first. Cancelled matches never count.

alter table public.match_players add column if not exists attendance text not null default 'present'
  check (attendance in ('present', 'late', 'no_show'));

-- Players marked no-show get no XP from later refreshes of the match.
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
    loop
      perform public.grant_xp(pl.id, m.id, 'absent', public.xp_split(pl.pos, -6), 'Vắng trận của đội');
    end loop;
  end loop;
end $$;


create or replace function public.set_attendance(p_match text, p_player text, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  mp public.match_players;
  pl public.players;
  ev public.player_xp;
  gained int[] := array[0, 0, 0, 0, 0, 0];
  pen int[];
  before int[]; after int[];
  i int;
begin
  if p_status not in ('present', 'late', 'no_show') then raise exception 'Trạng thái không hợp lệ.'; end if;
  select * into m from public.matches where id = p_match;
  if not found then raise exception 'Không tìm thấy trận đấu.'; end if;
  if m.status = 'cancelled' then raise exception 'Trận đã hủy — không tính điểm danh.'; end if;
  if m.status <> 'done' then raise exception 'Chỉ điểm danh sau khi trận kết thúc.'; end if;
  select * into mp from public.match_players where match_id = p_match and player_id = p_player for update;
  if not found then raise exception 'Cầu thủ này không đăng ký trận.'; end if;
  if not (public.is_admin() or public.is_chair_of(mp.team_id)) then raise exception 'Chỉ Chủ tịch của đội được điểm danh.'; end if;
  if mp.attendance = p_status then return 'Không có gì thay đổi'; end if;
  select * into pl from public.players where id = p_player;

  -- Undo the previous penalty (late / no_show) before applying the new one.
  select * into ev from public.player_xp where player_id = p_player and match_id = p_match and kind in ('late', 'no_show');
  if found then
    perform public.apply_xp(p_player, (select array_agg(-x order by o) from unnest(ev.dist) with ordinality t(x, o)));
    delete from public.player_xp where id = ev.id;
  end if;

  select stat_xp into before from public.players where id = p_player;
  if p_status = 'late' then
    perform public.grant_xp(p_player, p_match, 'late', public.xp_split(pl.pos, -5), 'Đi trễ');
  elsif p_status = 'no_show' then
    for ev in select * from public.player_xp where player_id = p_player and match_id = p_match and amount > 0 loop
      for i in 1..6 loop gained[i] := gained[i] + coalesce(ev.dist[i], 0); end loop;
    end loop;
    pen := public.xp_split(pl.pos, -10);
    for i in 1..6 loop pen[i] := pen[i] - gained[i]; end loop;
    perform public.grant_xp(p_player, p_match, 'no_show', pen, 'Điểm danh nhưng không đến');
  end if;
  -- Penalties can't push progress below 0: store what was really taken, so an undo gives back exactly that.
  if p_status <> 'present' then
    select stat_xp into after from public.players where id = p_player;
    update public.player_xp set dist = array[after[1] - before[1], after[2] - before[2], after[3] - before[3], after[4] - before[4], after[5] - before[5], after[6] - before[6]]
    where player_id = p_player and match_id = p_match and kind = p_status;
  end if;

  update public.match_players set attendance = p_status where match_id = p_match and player_id = p_player;
  -- Coming back to "present" after a no-show: award what the match gives again.
  if p_status <> 'no_show' then perform public.refresh_match_xp(p_match); end if;
  return case p_status when 'late' then pl.name || ': đi trễ (−5 XP)'
                       when 'no_show' then pl.name || ': vắng không lý do (mất XP trận, −10)'
                       else pl.name || ': có mặt' end;
end $$;

revoke execute on function public.set_attendance(text, text, text) from public, anon;
grant execute on function public.set_attendance(text, text, text) to authenticated;
