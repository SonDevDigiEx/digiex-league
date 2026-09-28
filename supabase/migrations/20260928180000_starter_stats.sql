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
