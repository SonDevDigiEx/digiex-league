-- OVR is computed from the primary position + the six stats (weights per position); nobody sets it by hand.
-- Players have 1–3 preferred positions (positions[1] = primary = players.pos) and can change them themselves.
-- Mirrors ovrOf() / POS_WEIGHTS in src/lib/league.ts.

alter table public.players add column if not exists positions text[];
update public.players set positions = array[pos] where positions is null or cardinality(positions) = 0;

-- Stats order: PAC SHO PAS DRI DEF PHY (GK: DIV HAN KIC REF SPD POS).
create or replace function public.compute_ovr(p_pos text, s int[]) returns int
language sql immutable as $$
  select greatest(40, least(99, round(
    s[1] * w[1] + s[2] * w[2] + s[3] * w[3] + s[4] * w[4] + s[5] * w[5] + s[6] * w[6]
  )::int))
  from (select case p_pos
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
    else array[1/6.0, 1/6.0, 1/6.0, 1/6.0, 1/6.0, 1/6.0] end::numeric[] as w) x
$$;

-- Normalise positions, keep pos = primary position, and compute OVR on every write.
create or replace function public.players_derive() returns trigger
language plpgsql as $$
declare bad text;
begin
  if new.positions is null or cardinality(new.positions) = 0 then new.positions := array[new.pos]; end if;
  if tg_op = 'UPDATE' and new.pos is distinct from old.pos and new.positions = old.positions then
    -- legacy writers that only change pos: make it the primary position
    new.positions := array_prepend(new.pos, array_remove(old.positions, new.pos));
  end if;
  if cardinality(new.positions) > 3 then raise exception 'Chọn tối đa 3 vị trí.'; end if;
  select p into bad from unnest(new.positions) p where p not in ('GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST') limit 1;
  if bad is not null then raise exception 'Vị trí không hợp lệ: %', bad; end if;
  if (select count(distinct p) from unnest(new.positions) p) <> cardinality(new.positions) then raise exception 'Vị trí bị trùng.'; end if;
  new.pos := new.positions[1];
  new.ovr := public.compute_ovr(new.pos, new.stats);
  return new;
end $$;

drop trigger if exists players_derive on public.players;
create trigger players_derive before insert or update on public.players
  for each row execute function public.players_derive();

alter table public.players drop constraint if exists players_positions_check;
alter table public.players add constraint players_positions_check check (cardinality(positions) between 1 and 3 and positions[1] = pos);
alter table public.players alter column positions set not null;

-- Recompute every existing OVR with the new formula.
update public.players set stats = stats;

-- A player chooses their own positions (first = primary).
create or replace function public.set_my_positions(p_positions text[]) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public.my_player();
  if p.id is null then raise exception 'Bạn chưa có hồ sơ cầu thủ.'; end if;
  if p_positions is null or cardinality(p_positions) = 0 then raise exception 'Chọn ít nhất 1 vị trí.'; end if;
  update public.players set positions = p_positions where id = p.id;
end $$;

revoke execute on function public.set_my_positions(text[]) from public, anon;
grant execute on function public.set_my_positions(text[]) to authenticated;
