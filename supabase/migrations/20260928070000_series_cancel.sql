-- Weekly fixed fixtures + cancelling a match with a reason.
-- * match_series: a fixture that repeats every week. When its latest match is finished (result entered, cancelled,
--   or 2 hours past kickoff) the next one is created 7 days later — by trigger, and by roll_series() which the app
--   calls on load (idempotent; a unique index prevents duplicates).
-- * matches.status gains 'cancelled' with cancel_reason; admins and the two chairmen can cancel an upcoming match.

create table public.match_series (
  id         text primary key default gen_random_uuid()::text,
  home_team  text not null references public.teams on delete cascade,
  away_team  text not null references public.teams on delete cascade,
  venue      text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check (home_team <> away_team)
);
alter table public.match_series enable row level security;
create policy "series: public read" on public.match_series for select using (true);
create policy "series: admin update" on public.match_series for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.match_series from anon, authenticated;
revoke update on public.match_series from anon;

alter table public.matches add column if not exists series_id text references public.match_series on delete set null;
alter table public.matches add column if not exists cancel_reason text check (length(cancel_reason) <= 200);
alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check check (status in ('up', 'done', 'cancelled'));
create unique index if not exists matches_series_kickoff on public.matches (series_id, kickoff) where series_id is not null;

-- Create the next match for one series if its latest match is over. Skips weeks that already passed.
create or replace function public.roll_one_series(p_series text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.match_series;
  last public.matches;
  nxt timestamptz;
begin
  select * into s from public.match_series where id = p_series and active;
  if not found then return; end if;
  select * into last from public.matches where series_id = s.id order by kickoff desc limit 1;
  if not found then return; end if;
  if last.status = 'up' and last.kickoff + interval '2 hours' > now() then return; end if;
  nxt := last.kickoff + interval '7 days';
  while nxt + interval '2 hours' < now() loop nxt := nxt + interval '7 days'; end loop;
  insert into public.matches (kickoff, home_team, away_team, venue, series_id)
  values (nxt, s.home_team, s.away_team, s.venue, s.id)
  on conflict do nothing;
end $$;

create or replace function public.roll_series() returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.match_series where active loop
    perform public.roll_one_series(r.id);
  end loop;
end $$;

create or replace function public.on_series_match_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.series_id is not null and new.status in ('done', 'cancelled') and old.status is distinct from new.status then
    perform public.roll_one_series(new.series_id);
  end if;
  return new;
end $$;

drop trigger if exists on_match_closed on public.matches;
create trigger on_match_closed after update of status on public.matches
  for each row execute function public.on_series_match_closed();

-- Admin: start a weekly series; the first match is at p_first.
create or replace function public.create_series(p_home text, p_away text, p_first timestamptz, p_venue text) returns text
language plpgsql security definer set search_path = public as $$
declare sid text;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được lên lịch.'; end if;
  if p_home is null or p_away is null or p_home = p_away then raise exception 'Chọn hai đội khác nhau.'; end if;
  if p_first is null then raise exception 'Chọn thời gian.'; end if;
  insert into public.match_series (home_team, away_team, venue) values (p_home, p_away, coalesce(nullif(btrim(p_venue), ''), 'Sân bóng Hoàng Mai · Sân số 3'))
  returning id into sid;
  insert into public.matches (kickoff, home_team, away_team, venue, series_id)
  values (p_first, p_home, p_away, coalesce(nullif(btrim(p_venue), ''), 'Sân bóng Hoàng Mai · Sân số 3'), sid);
  return sid;
end $$;

-- Admin or either team's chairman cancels an upcoming match with a reason.
create or replace function public.cancel_match(p_match text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Không tìm thấy trận.'; end if;
  if not (public.is_admin() or public.is_chair_of(m.home_team) or public.is_chair_of(m.away_team)) then
    raise exception 'Chỉ Ban tổ chức hoặc Chủ tịch hai đội được hủy trận.';
  end if;
  if m.status <> 'up' then raise exception 'Chỉ hủy được trận chưa diễn ra.'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Nhập lý do hủy trận.'; end if;
  update public.matches set status = 'cancelled', cancel_reason = left(btrim(p_reason), 200) where id = m.id;
end $$;

revoke execute on function public.create_series(text, text, timestamptz, text), public.cancel_match(text, text) from public, anon;
grant execute on function public.create_series(text, text, timestamptz, text), public.cancel_match(text, text) to authenticated;
revoke execute on function public.roll_one_series(text) from public, anon, authenticated;
grant execute on function public.roll_series() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_series;
  end if;
end $$;
