-- Keep the stored market value (players.value) equal to the live calculation (value_factors):
--   * report and fix any player whose stored value drifted,
--   * refresh everyone at most once an hour (was once a day) on page load,
--   * sync_player_value: anyone viewing a card can make the server recompute that one player.

-- 1) What drifted (shown in the SQL editor output), then resync all.
select p.name, p.value as stored, public.compute_player_value(p.id) as live
from public.players p
where p.value is distinct from public.compute_player_value(p.id)
order by abs(coalesce(p.value, 0) - public.compute_player_value(p.id)) desc;

select public.refresh_all_values();

-- 2) Hourly instead of daily (same RPC name, the app already calls it on load).
create or replace function public.daily_value_refresh() returns void
language plpgsql security definer set search_path = public as $$
declare stamp text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24');
begin
  if exists (select 1 from public.app_state where key = 'values_refreshed_on' and value = stamp) then return; end if;
  insert into public.app_state (key, value) values ('values_refreshed_on', stamp)
  on conflict (key) do update set value = excluded.value;
  perform public.refresh_all_values();
end $$;

-- 3) Recompute one player on demand (harmless: it only applies the official formula).
create or replace function public.sync_player_value(p_player text) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_player_value(p_player);
  return (select value from public.players where id = p_player);
end $$;
revoke execute on function public.sync_player_value(text) from public;
grant execute on function public.sync_player_value(text) to anon, authenticated;
