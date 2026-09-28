-- Self rename (at most once every 24 hours) and admin "delete user".

alter table public.profiles add column if not exists name_changed_at timestamptz;

-- The new name also goes on the player card and on the team card (chairman / BHL).
create or replace function public.set_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  next_at timestamptz;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Bạn cần đăng nhập.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 40 then raise exception 'Tên phải từ 2 đến 40 ký tự.'; end if;
  if nm = me.name then raise exception 'Tên mới trùng với tên hiện tại.'; end if;
  next_at := me.name_changed_at + interval '24 hours';
  if next_at > now() then
    raise exception 'Bạn chỉ được đổi tên 1 lần mỗi 24 giờ. Thử lại sau % ngày %.',
      to_char(next_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'), to_char(next_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM');
  end if;

  update public.profiles set name = nm, name_changed_at = now() where id = me.id;
  update public.players set name = nm where user_id = me.id;
  if me.team_id is not null and me.role = 'chair' then
    update public.teams set chair_name = nm where id = me.team_id and chair_name = me.name;
  elsif me.team_id is not null and me.role = 'coach' then
    update public.teams set coach_name = nm where id = me.team_id and coach_name = me.name;
  end if;
end $$;

revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;

-- Admin: remove an account for good (login + profile). The player card is kept as a normal
-- (unlinked) player unless p_delete_player is true.
create or replace function public.delete_user(p_user uuid, p_delete_player boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  u public.profiles;
begin
  if not public.is_admin() then raise exception 'Chỉ Ban tổ chức được xóa tài khoản.'; end if;
  if p_user = auth.uid() then raise exception 'Bạn không thể tự xóa tài khoản của mình.'; end if;
  select * into u from public.profiles where id = p_user;
  if not found then raise exception 'Không tìm thấy tài khoản.'; end if;

  if u.team_id is not null and u.role = 'chair' then
    update public.teams set chair_name = 'Chưa bổ nhiệm' where id = u.team_id and chair_name = u.name;
  elsif u.team_id is not null and u.role = 'coach' then
    update public.teams set coach_name = coalesce((select name from public.profiles where role = 'coach' and team_id = u.team_id and id <> u.id limit 1), 'Chưa bổ nhiệm')
    where id = u.team_id and coach_name = u.name;
  end if;

  if p_delete_player then
    delete from public.players where user_id = p_user;
  end if;
  delete from auth.users where id = p_user;          -- cascades to profiles; players.user_id → null
end $$;

revoke execute on function public.delete_user(uuid, boolean) from public, anon;
grant execute on function public.delete_user(uuid, boolean) to authenticated;
