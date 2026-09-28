-- Saved starting lineups per team and format (S5 / S7), built by the team's chairman / BHL.
-- slots: [{ "pid": "<player id>" | null, "x": 0–100, "y": 0–100 }] — x/y are % of the team's own half-pitch
-- view (own goal at the bottom). Empty slots (pid null) are allowed.

create table if not exists public.team_lineups (
  team_id    text not null references public.teams on delete cascade,
  format     text not null check (format in ('s5', 's7')),
  formation  text not null check (length(formation) between 1 and 20),
  slots      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles on delete set null,
  primary key (team_id, format)
);

alter table public.team_lineups enable row level security;
drop policy if exists "team_lineups: public read" on public.team_lineups;
create policy "team_lineups: public read" on public.team_lineups for select using (true);
revoke insert, update, delete on public.team_lineups from anon, authenticated;

create or replace function public.save_lineup(p_team text, p_format text, p_formation text, p_slots jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  n int;
  s jsonb;
  pids text[] := '{}';
  pid text;
  clean jsonb := '[]'::jsonb;
begin
  if not public.can_manage_team(p_team) then raise exception 'Chỉ Chủ tịch, BHL của đội hoặc Ban tổ chức được xếp đội hình.'; end if;
  if p_format not in ('s5', 's7') then raise exception 'Chế độ sân không hợp lệ.'; end if;
  if jsonb_typeof(p_slots) <> 'array' then raise exception 'Đội hình không hợp lệ.'; end if;
  n := jsonb_array_length(p_slots);
  if n <> (case p_format when 's5' then 5 else 7 end) then raise exception 'Số vị trí không khớp với sân %.', substr(p_format, 2); end if;

  for s in select * from jsonb_array_elements(p_slots) loop
    pid := nullif(s ->> 'pid', '');
    if pid is not null then
      if pid = any(pids) then raise exception 'Một cầu thủ chỉ đứng 1 vị trí.'; end if;
      if not exists (select 1 from public.players where id = pid and team_id = p_team) then
        raise exception 'Chỉ xếp được cầu thủ trong đội.';
      end if;
      pids := pids || pid;
    end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'pid', pid,
      'x', greatest(0, least(100, coalesce((s ->> 'x')::numeric, 50))),
      'y', greatest(0, least(100, coalesce((s ->> 'y')::numeric, 50)))));
  end loop;

  insert into public.team_lineups (team_id, format, formation, slots, updated_at, updated_by)
  values (p_team, p_format, btrim(p_formation), clean, now(), auth.uid())
  on conflict (team_id, format) do update
    set formation = excluded.formation, slots = excluded.slots, updated_at = now(), updated_by = auth.uid();
end $$;

revoke execute on function public.save_lineup(text, text, text, jsonb) from public, anon;
grant execute on function public.save_lineup(text, text, text, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_lineups') then
    alter publication supabase_realtime add table public.team_lineups;
  end if;
end $$;
