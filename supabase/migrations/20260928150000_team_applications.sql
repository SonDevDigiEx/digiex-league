-- Free agents apply to join a team; that team's chairman (or an admin) accepts or rejects.

create table if not exists public.team_applications (
  id          text primary key default gen_random_uuid()::text,
  player_id   text not null references public.players on delete cascade,
  team_id     text not null references public.teams on delete cascade,
  message     text check (length(message) <= 200),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles on delete set null
);
create unique index if not exists team_applications_one_pending on public.team_applications (player_id, team_id) where status = 'pending';
create index if not exists team_applications_team_idx on public.team_applications (team_id, status);

alter table public.team_applications enable row level security;
drop policy if exists "team_applications: members read" on public.team_applications;
create policy "team_applications: members read" on public.team_applications for select to authenticated using (true);
revoke insert, update, delete on public.team_applications from anon, authenticated;

create or replace function public.apply_team(p_team text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  select * into p from public.players where user_id = auth.uid() for update;
  if not found then raise exception 'Bạn chưa có hồ sơ cầu thủ. Hãy chờ Ban tổ chức duyệt.'; end if;
  if p.team_id is not null then raise exception 'Chỉ cầu thủ tự do mới ứng tuyển được.'; end if;
  if public.is_staff_player(p.id) then raise exception 'Chủ tịch / BHL không thể ứng tuyển đội khác.'; end if;
  if not exists (select 1 from public.teams where id = p_team) then raise exception 'Không tìm thấy đội.'; end if;
  if exists (select 1 from public.team_applications where player_id = p.id and team_id = p_team and status = 'pending') then
    raise exception 'Bạn đã ứng tuyển đội này, đang chờ Chủ tịch duyệt.';
  end if;
  if (select count(*) from public.team_applications where player_id = p.id and status = 'pending') >= 3 then
    raise exception 'Bạn chỉ được chờ duyệt tối đa 3 đơn cùng lúc.';
  end if;
  insert into public.team_applications (player_id, team_id, message)
  values (p.id, p_team, nullif(btrim(coalesce(p_message, '')), ''));
end $$;

create or replace function public.cancel_application(p_id text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.team_applications;
begin
  select * into a from public.team_applications where id = p_id for update;
  if not found or a.status <> 'pending' then raise exception 'Đơn không còn hiệu lực.'; end if;
  if not exists (select 1 from public.players where id = a.player_id and user_id = auth.uid()) then
    raise exception 'Chỉ người gửi được rút đơn.';
  end if;
  update public.team_applications set status = 'cancelled', decided_at = now() where id = a.id;
end $$;

create or replace function public.respond_application(p_id text, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  a public.team_applications;
  p public.players;
  tname text;
begin
  select * into a from public.team_applications where id = p_id for update;
  if not found or a.status <> 'pending' then raise exception 'Đơn không còn hiệu lực.'; end if;
  if not (public.is_admin() or public.is_chair_of(a.team_id)) then raise exception 'Chỉ Chủ tịch đội được duyệt đơn ứng tuyển.'; end if;
  select * into p from public.players where id = a.player_id for update;
  select name into tname from public.teams where id = a.team_id;

  if not p_accept then
    update public.team_applications set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = a.id;
    return 'Đã từ chối đơn của ' || p.name;
  end if;
  if p.team_id is not null then
    update public.team_applications set status = 'cancelled', decided_at = now() where id = a.id;
    return p.name || ' đã có đội, đơn tự hủy';
  end if;

  update public.team_applications set status = 'accepted', decided_at = now(), decided_by = auth.uid() where id = a.id;
  update public.players set team_id = a.team_id where id = p.id;       -- trigger below cancels the other pending applications
  insert into public.transfers (player_id, player_name, from_team, to_team, fee) values (p.id, p.name, null, a.team_id, 0);
  update public.offers set status = 'cancelled' where player_id = p.id and status = 'pending';
  return 'Chào mừng ' || p.name || ' gia nhập ' || tname || '!';
end $$;

-- Whenever a free agent joins a team (application, invitation, admin move…), their other pending applications lapse.
create or replace function public.lapse_applications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is not null and old.team_id is distinct from new.team_id then
    update public.team_applications set status = 'cancelled', decided_at = now()
    where player_id = new.id and status = 'pending';
  end if;
  return new;
end $$;
drop trigger if exists on_player_team_lapse_apps on public.players;
create trigger on_player_team_lapse_apps after update of team_id on public.players
  for each row execute function public.lapse_applications();

revoke execute on function public.apply_team(text, text), public.cancel_application(text), public.respond_application(text, boolean) from public, anon;
grant execute on function public.apply_team(text, text), public.cancel_application(text), public.respond_application(text, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_applications') then
    alter publication supabase_realtime add table public.team_applications;
  end if;
end $$;
