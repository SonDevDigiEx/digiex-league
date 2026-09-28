-- ONE-OFF: reset every player's stats to around 75 OVR (random, shaped by their primary position)
-- and start the XP system from zero. Run AFTER migrations/20260928170000_xp.sql.
--
--  * Stats the position relies on come out higher, the others lower (e.g. a CB gets high DEF / PHY).
--  * Each player's OVR lands randomly between 72 and 78.
--  * XP, stat progress and the XP history are cleared.

do $$
declare
  p record;
  w numeric[];
  s int[];
  i int;
  target int;
  cur int;
  tries int;
begin
  for p in select id, pos from public.players loop
    w := public.pos_weights(p.pos);
    target := 72 + floor(random() * 7)::int;                         -- 72..78
    s := array[0, 0, 0, 0, 0, 0];
    for i in 1..6 loop
      -- important stats higher, unused ones lower, plus a little noise
      s[i] := greatest(40, least(92, round(target + (w[i] - 1 / 6.0) * 60 + (random() * 8 - 4))::int));
    end loop;
    -- nudge all stats together until OVR hits the target
    tries := 0;
    loop
      cur := public.compute_ovr(p.pos, s);
      exit when cur = target or tries > 30;
      for i in 1..6 loop s[i] := greatest(40, least(95, s[i] + sign(target - cur)::int)); end loop;
      tries := tries + 1;
    end loop;
    update public.players set stats = s, stat_xp = '{0,0,0,0,0,0}', xp = 0 where id = p.id;
  end loop;
end $$;

delete from public.player_xp;

select name, pos, ovr, stats from public.players order by ovr desc;
