-- Tournaments (S5 / S7), random group / bracket draw, awards (team + player history), team cover photos.
-- Everything is publicly readable; only admins write (RLS + draw RPC). Team staff may set their team's cover.

create table if not exists public.tournaments (
  id          text primary key default gen_random_uuid()::text,
  name        text not null check (length(btrim(name)) between 1 and 80),
  format      text not null default 's7' check (format in ('s5', 's7')),
  structure   text not null default 'league' check (structure in ('league', 'groups', 'knockout')),
  group_count int  not null default 2 check (group_count between 1 and 8),
  status      text not null default 'upcoming' check (status in ('upcoming', 'ongoing', 'finished')),
  starts_on   date,
  ends_on     date,
  -- key numbers from the template: weeks, squad, duration, points…  (see src/lib/tournament.ts)
  settings    jsonb not null default '{}',
  -- full rules as Markdown (prefilled from the template, editable)
  rules_md    text not null default '' check (length(rules_md) <= 20000),
  -- knockout bracket: [[{ "home": team|null, "away": team|null }, …] per round]
  bracket     jsonb,
  drawn_at    timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.tournament_teams (
  tournament_id text not null references public.tournaments on delete cascade,
  team_id       text not null references public.teams on delete cascade,
  group_label   text,
  seed          int,
  primary key (tournament_id, team_id)
);

create table if not exists public.tournament_awards (
  id            text primary key default gen_random_uuid()::text,
  tournament_id text not null references public.tournaments on delete cascade,
  kind          text not null check (kind in ('champion', 'runner_up', 'top_scorer', 'top_assist', 'mvp', 'golden_glove', 'attendance', 'custom')),
  title         text not null check (length(btrim(title)) between 1 and 80),
  team_id       text references public.teams on delete set null,     -- the winning team, or the player's team at the time
  player_id     text references public.players on delete set null,
  player_name   text,                                                -- kept if the player is deleted later
  note          text check (length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index if not exists tournament_awards_player_idx on public.tournament_awards (player_id);
create index if not exists tournament_awards_team_idx on public.tournament_awards (team_id);

alter table public.matches add column if not exists tournament_id text references public.tournaments on delete set null;
alter table public.matches add column if not exists stage text check (length(stage) <= 40);
alter table public.match_series add column if not exists tournament_id text references public.tournaments on delete set null;
alter table public.teams add column if not exists cover_url text;
grant update (cover_url) on public.teams to authenticated;

-- ───────── RLS ─────────
alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_awards enable row level security;
do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_teams', 'tournament_awards'] loop
    execute format('drop policy if exists "%1$s: public read" on public.%1$s', t);
    execute format('drop policy if exists "%1$s: admin write" on public.%1$s', t);
    execute format('create policy "%1$s: public read" on public.%1$s for select using (true)', t);
    execute format('create policy "%1$s: admin write" on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke insert, update, delete on public.%1$s from anon', t);
  end loop;
end $$;

-- ───────── draw ─────────
-- Randomly assign groups (groups) or build a first-round bracket padded with byes (knockout). League: seeds only.
create or replace function public.draw_tournament(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.tournaments;
  ids text[];
  n int; g int; size int; i int;
  round1 jsonb := '[]'::jsonb;
  rounds jsonb := '[]'::jsonb;
  slots int;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được bốc thăm.'; end if;
  select * into t from public.tournaments where id = p_id for update;
  if not found then raise exception 'Không tìm thấy giải đấu.'; end if;
  select array_agg(team_id order by random()) into ids from public.tournament_teams where tournament_id = p_id;
  n := coalesce(cardinality(ids), 0);
  if n < 2 then raise exception 'Cần ít nhất 2 đội để bốc thăm.'; end if;

  for i in 1..n loop
    update public.tournament_teams set seed = i, group_label = null where tournament_id = p_id and team_id = ids[i];
  end loop;

  if t.structure = 'groups' and n > 2 then
    g := greatest(1, least(t.group_count, n / 2));             -- at least 2 teams per group
    for i in 1..n loop                                          -- snake: A B C C B A …
      update public.tournament_teams
      set group_label = chr(65 + case when ((i - 1) / g) % 2 = 0 then (i - 1) % g else g - 1 - (i - 1) % g end)
      where tournament_id = p_id and team_id = ids[i];
    end loop;
    update public.tournaments set bracket = null, drawn_at = now() where id = p_id;
  elsif t.structure = 'knockout' and n > 2 then
    size := 1; while size < n loop size := size * 2; end loop;
    -- spread byes: top seeds meet an empty slot
    for i in 1..size / 2 loop
      round1 := round1 || jsonb_build_array(jsonb_build_object(
        'home', ids[i],
        'away', case when size - i + 1 <= n then ids[size - i + 1] end));
    end loop;
    rounds := jsonb_build_array(round1);
    slots := size / 4;
    while slots >= 1 loop
      rounds := rounds || jsonb_build_array((select jsonb_agg(jsonb_build_object('home', null, 'away', null)) from generate_series(1, slots)));
      slots := slots / 2;
    end loop;
    update public.tournaments set bracket = rounds, drawn_at = now() where id = p_id;
  else
    update public.tournaments set bracket = null, drawn_at = now() where id = p_id;
  end if;
end $$;

revoke execute on function public.draw_tournament(text) from public, anon;
grant execute on function public.draw_tournament(text) to authenticated;

-- Fixed weekly fixtures keep their tournament / stage.
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
  insert into public.matches (kickoff, home_team, away_team, venue, series_id, tournament_id, stage)
  values (nxt, s.home_team, s.away_team, s.venue, s.id, coalesce(s.tournament_id, last.tournament_id), last.stage)
  on conflict do nothing;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tournaments', 'tournament_teams', 'tournament_awards'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
