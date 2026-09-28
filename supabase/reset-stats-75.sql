-- ONE-OFF: reset every player's stats to around 75 OVR (random, shaped by their primary position)
-- and start the XP system from zero. Run AFTER migrations 20260928170000_xp.sql and
-- 20260928180000_starter_stats.sql (new players get the same starter stats automatically).

update public.players set stats = public.starter_stats(pos), stat_xp = '{0,0,0,0,0,0}', xp = 0;
delete from public.player_xp;

select name, pos, ovr, stats from public.players order by ovr desc;
