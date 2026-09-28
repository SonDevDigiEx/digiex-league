-- Man of the Match: picked after the final whistle by the admin or the chairman of either team.
alter table public.matches add column if not exists mom_player text references public.players on delete set null;

create or replace function public.set_mom(p_match text, p_player text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if not found then raise exception 'Không tìm thấy trận đấu.'; end if;
  if not (public.is_admin() or public.is_chair_of(m.home_team) or public.is_chair_of(m.away_team)) then
    raise exception 'Chỉ Ban tổ chức hoặc Chủ tịch của hai đội được chọn MOM.';
  end if;
  if m.status <> 'done' then raise exception 'Chỉ chọn MOM khi trận đã kết thúc.'; end if;
  if p_player is not null and not exists (
    select 1 from public.match_players where match_id = p_match and player_id = p_player
    union all
    select 1 from public.players where id = p_player and team_id in (m.home_team, m.away_team)
  ) then
    raise exception 'Cầu thủ này không thi đấu trận này.';
  end if;
  update public.matches set mom_player = p_player where id = p_match;
end $$;

revoke execute on function public.set_mom(text, text) from public, anon;
grant execute on function public.set_mom(text, text) to authenticated;
