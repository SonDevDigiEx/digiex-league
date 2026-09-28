-- When a player joins a team (signed, transferred, application accepted…), their check-ins for upcoming
-- matches follow the new team: moved to the new team's side if it plays that match, removed otherwise.
-- ("Bận" answers get the new team too.) Also repairs rows that are already inconsistent.

create or replace function public.rsvp_follow_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is null or new.team_id is not distinct from old.team_id then return new; end if;
  -- matches the new team plays: switch side
  update public.match_players mp set team_id = new.team_id
  from public.matches m
  where mp.match_id = m.id and mp.player_id = new.id and m.status = 'up'
    and new.team_id in (m.home_team, m.away_team) and mp.team_id is distinct from new.team_id;
  -- matches the new team doesn't play: the old answer no longer makes sense
  delete from public.match_players mp using public.matches m
  where mp.match_id = m.id and mp.player_id = new.id and m.status = 'up'
    and new.team_id not in (m.home_team, m.away_team);
  update public.match_busy b set team_id = new.team_id
  from public.matches m
  where b.match_id = m.id and b.player_id = new.id and m.status = 'up' and new.team_id in (m.home_team, m.away_team);
  delete from public.match_busy b using public.matches m
  where b.match_id = m.id and b.player_id = new.id and m.status = 'up' and new.team_id not in (m.home_team, m.away_team);
  return new;
end $$;

drop trigger if exists on_player_team_rsvp on public.players;
create trigger on_player_team_rsvp after update of team_id on public.players
  for each row execute function public.rsvp_follow_team();

-- Repair: players with a team who are checked in for the other side of an upcoming match.
update public.match_players mp set team_id = p.team_id
from public.players p, public.matches m
where mp.player_id = p.id and mp.match_id = m.id and m.status = 'up'
  and p.team_id is not null and p.team_id in (m.home_team, m.away_team) and mp.team_id <> p.team_id;
delete from public.match_players mp using public.players p, public.matches m
where mp.player_id = p.id and mp.match_id = m.id and m.status = 'up'
  and p.team_id is not null and p.team_id not in (m.home_team, m.away_team);
update public.match_busy b set team_id = p.team_id
from public.players p, public.matches m
where b.player_id = p.id and b.match_id = m.id and m.status = 'up'
  and p.team_id is not null and p.team_id in (m.home_team, m.away_team) and b.team_id is distinct from p.team_id;
