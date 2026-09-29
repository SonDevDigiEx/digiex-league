-- System admin is now a separate flag (profiles.admin), independent of the team role:
-- a person can be e.g. Chủ tịch F8 (role = chair) AND Ban tổ chức (admin = true).
-- role = 'admin' keeps working (it implies the flag) for existing accounts.

alter table public.profiles add column if not exists admin boolean not null default false;
update public.profiles set admin = true where role = 'admin' and not admin;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin or role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- Grant / remove the admin flag (admins only; you can't remove your own).
create or replace function public.set_admin(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare u public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được cấp quyền admin.'; end if;
  if p_user = auth.uid() and not p_on then raise exception 'Bạn không thể tự bỏ quyền admin của mình.'; end if;
  select * into u from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;
  if u.role = 'pending' then raise exception 'Hãy duyệt tài khoản trước.'; end if;
  update public.profiles set admin = p_on,
    role = case when not p_on and role = 'admin' then 'member' else role end
  where id = p_user;
end $$;
revoke execute on function public.set_admin(uuid, boolean) from public, anon;
grant execute on function public.set_admin(uuid, boolean) to authenticated;

-- set_member: an admin may now give themselves a team role (they stay admin through the flag).
create or replace function public.set_member(p_user uuid, p_role text, p_team text) returns void
language plpgsql security definer set search_path = public as $$
declare
  prev public.profiles;
  cur public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được phân quyền.'; end if;
  if p_role not in ('admin', 'chair', 'coach', 'member') then raise exception 'Vai trò không hợp lệ.'; end if;
  if p_role in ('chair', 'coach') and (p_team is null or not exists (select 1 from public.teams where id = p_team)) then
    raise exception 'Chọn đội cho Chủ tịch / BHL.';
  end if;
  select * into prev from public.profiles where id = p_user for update;
  if not found then raise exception 'Không tìm thấy thành viên.'; end if;

  -- Whoever held role 'admin' keeps admin rights through the flag when moving to a team role.
  update public.profiles set role = p_role, team_id = case when p_role in ('chair', 'coach') then p_team else null end,
    admin = admin or p_role = 'admin' or prev.role = 'admin'
  where id = p_user returning * into cur;

  if p_role = 'chair' then
    update public.profiles set role = 'member', team_id = null where role = 'chair' and team_id = p_team and id <> p_user;
    update public.teams set chair_name = cur.name, chair_since = extract(year from now())::text where id = p_team;
  elsif p_role = 'coach' then
    update public.teams set coach_name = cur.name where id = p_team;
  end if;
  if prev.role = 'chair' and prev.team_id is not null and (p_role <> 'chair' or p_team is distinct from prev.team_id) then
    update public.teams set chair_name = 'Chưa bổ nhiệm' where id = prev.team_id and chair_name = prev.name;
  end if;
  if prev.role = 'coach' and prev.team_id is not null and (p_role <> 'coach' or p_team is distinct from prev.team_id) then
    update public.teams set coach_name = coalesce((select name from public.profiles where role = 'coach' and team_id = prev.team_id limit 1), 'Chưa bổ nhiệm')
    where id = prev.team_id;
  end if;
end $$;

-- Users can't flip their own flag through the table (only via set_admin).
revoke update (admin) on public.profiles from authenticated, anon;

-- Admins have chairman rights in every team (approve offers / applications, MOM, attendance, bonus…).
create or replace function public.is_chair_of(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.my_role() = 'chair' and public.my_team() = t, false)
$$;
