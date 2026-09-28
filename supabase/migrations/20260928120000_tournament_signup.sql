-- Team chairmen register (or withdraw) their own team while a tournament is still upcoming.
-- Any change to the entry list clears the previous draw; the admin draws again once registration closes.

create or replace function public.register_tournament(p_id text, p_join boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  t  public.tournaments;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or me.role <> 'chair' or me.team_id is null then
    raise exception 'Chỉ Chủ tịch đội được đăng ký tham gia giải.';
  end if;
  select * into t from public.tournaments where id = p_id for update;
  if not found then raise exception 'Không tìm thấy giải đấu.'; end if;
  if t.status <> 'upcoming' then raise exception 'Giải đã khởi tranh, không thể thay đổi đăng ký.'; end if;

  if p_join then
    insert into public.tournament_teams (tournament_id, team_id) values (p_id, me.team_id) on conflict do nothing;
  else
    delete from public.tournament_teams where tournament_id = p_id and team_id = me.team_id;
  end if;

  update public.tournament_teams set group_label = null, seed = null where tournament_id = p_id;
  update public.tournaments set bracket = null, drawn_at = null where id = p_id;
end $$;

revoke execute on function public.register_tournament(text, boolean) from public, anon;
grant execute on function public.register_tournament(text, boolean) to authenticated;
