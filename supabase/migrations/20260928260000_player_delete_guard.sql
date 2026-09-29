-- Deleting players: team staff may delete cards they created (no linked account);
-- a card linked to a real member's account can only be deleted by an admin (or through delete_user).
create or replace function public.guard_player_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id is not null and auth.uid() is not null and not public.is_admin() then
    raise exception 'Cầu thủ này gắn với tài khoản thành viên — chỉ Ban tổ chức được xóa.';
  end if;
  return old;
end $$;

drop trigger if exists players_guard_delete on public.players;
create trigger players_guard_delete before delete on public.players
  for each row execute function public.guard_player_delete();
