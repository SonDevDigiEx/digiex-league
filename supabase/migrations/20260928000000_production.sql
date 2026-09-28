-- Production auth + admin tooling.
-- * Google sign-in only; accounts outside the company domain are refused when the auth user is created.
-- * Emails listed in public.bootstrap_admins become admin on first sign-in.
-- * Admin RPCs to manage member roles, edit teams and record results.

-- ───────────────────────── config ─────────────────────────

create table if not exists public.bootstrap_admins (email text primary key);
alter table public.bootstrap_admins enable row level security;  -- no policies: invisible to clients
insert into public.bootstrap_admins (email) values ('son.pham@digiex.group') on conflict do nothing;

create or replace function public.allowed_email(e text) returns boolean
language sql immutable as $$
  select lower(coalesce(e, '')) like '%@digiex.group'
$$;

-- ───────────────────────── profiles ─────────────────────────

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists avatar_url text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(split_part(new.email, '@', 1));
  uname text := base;
  n int := 1;
begin
  if not public.allowed_email(new.email) then
    raise exception 'Chỉ tài khoản @digiex.group được đăng nhập.';
  end if;
  while exists (select 1 from public.profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into public.profiles (id, username, name, email, avatar_url, role)
  values (
    new.id,
    uname,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), base),
    lower(new.email),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (select 1 from public.bootstrap_admins b where b.email = lower(new.email)) then 'admin' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Keep name/avatar in sync when Google profile data changes.
create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    email = lower(new.email),
    avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url)
  where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- ───────────────────────── admin RPCs ─────────────────────────

-- Set a member's role and team. Chairman/coach names on the team card follow the assignment.
create or replace function public.set_member(p_user uuid, p_role text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev public.profiles;
  cur public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được phân quyền.'; end if;
  if p_user = auth.uid() and p_role <> 'admin' then raise exception 'Bạn không thể tự bỏ quyền Ban tổ chức của mình.'; end if;
  if p_role not in ('admin', 'chair', 'coach', 'member') then raise exception 'Vai trò không hợp lệ.'; end if;
  if p_role in ('chair', 'coach') and (p_team is null or not exists (select 1 from public.teams where id = p_team)) then
    raise exception 'Chọn đội cho Chủ tịch / BHL.';
  end if;
  select * into prev from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;

  update public.profiles set role = p_role, team_id = case when p_role in ('chair', 'coach') then p_team else null end
  where id = p_user returning * into cur;

  -- Only one chairman per team: demote the previous one.
  if p_role = 'chair' then
    update public.profiles set role = 'member', team_id = null where role = 'chair' and team_id = p_team and id <> p_user;
    update public.teams set chair_name = cur.name, chair_since = extract(year from now())::text where id = p_team;
  elsif p_role = 'coach' then
    update public.teams set coach_name = cur.name where id = p_team;
  end if;
  -- Clear the name on the team they left.
  if prev.role = 'chair' and prev.team_id is not null and (p_role <> 'chair' or p_team is distinct from prev.team_id) then
    update public.teams set chair_name = 'Chưa bổ nhiệm' where id = prev.team_id and chair_name = prev.name;
  end if;
  if prev.role = 'coach' and prev.team_id is not null and (p_role <> 'coach' or p_team is distinct from prev.team_id) then
    update public.teams set coach_name = coalesce((select name from public.profiles where role = 'coach' and team_id = prev.team_id limit 1), 'Chưa bổ nhiệm')
    where id = prev.team_id;
  end if;
end $$;

-- Staff edit motto / chairman quote; admins may also rename and recolour.
create or replace function public.update_team(p_team text, p_name text, p_short text, p_motto text, p_quote text, p_color text, p_color2 text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_team(p_team) then raise exception 'Bạn không có quyền với đội này.'; end if;
  update public.teams set
    motto = coalesce(nullif(btrim(p_motto), ''), motto),
    chair_quote = coalesce(nullif(btrim(p_quote), ''), chair_quote)
  where id = p_team;
  if public.is_admin() then
    update public.teams set
      name = coalesce(nullif(btrim(p_name), ''), name),
      short = coalesce(nullif(upper(left(btrim(p_short), 4)), ''), short),
      color = coalesce(p_color, color),
      color2 = coalesce(p_color2, color2)
    where id = p_team;
  end if;
end $$;

-- Record (or correct) a result with optional scorers: [{ "pid", "side", "min"? }].
create or replace function public.save_result(p_match text, p_hs int, p_as int, p_scorers jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được nhập kết quả.'; end if;
  if p_hs < 0 or p_as < 0 then raise exception 'Tỉ số không hợp lệ.'; end if;
  if jsonb_typeof(coalesce(p_scorers, '[]')) <> 'array' then raise exception 'Danh sách ghi bàn không hợp lệ.'; end if;
  update public.matches set home_score = p_hs, away_score = p_as, status = 'done', scorers = coalesce(p_scorers, '[]')
  where id = p_match;
  if not found then raise exception 'Không tìm thấy trận.'; end if;
end $$;

revoke execute on function public.set_member(uuid, text, text), public.update_team(text, text, text, text, text, text, text), public.save_result(text, int, int, jsonb) from public, anon;
grant execute on function public.set_member(uuid, text, text), public.update_team(text, text, text, text, text, text, text), public.save_result(text, int, int, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
