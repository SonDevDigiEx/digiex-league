-- Remember each player's starting stats, so the app can rank progress ("Tiến bộ") = stats gained since then.
alter table public.players add column if not exists base_stats int[];
update public.players set base_stats = stats where base_stats is null;

-- New players: starter stats are also the baseline.
create or replace function public.players_starter() returns trigger
language plpgsql as $$
begin
  new.stats := public.starter_stats(coalesce(new.positions[1], new.pos));
  new.base_stats := new.stats;
  new.stat_xp := '{0,0,0,0,0,0}';
  new.xp := 0;
  return new;
end $$;
