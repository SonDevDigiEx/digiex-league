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
