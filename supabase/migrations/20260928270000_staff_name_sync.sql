-- The chairman / BHL names stored on the team card follow the profile name (renames, Google name changes),
-- and are re-synced once now.
create or replace function public.sync_staff_names() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name and new.team_id is not null then
    if new.role = 'chair' then update public.teams set chair_name = new.name where id = new.team_id; end if;
    if new.role = 'coach' then
      update public.teams set coach_name = (select string_agg(name, ', ' order by name) from public.profiles where role = 'coach' and team_id = new.team_id)
      where id = new.team_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_profile_name_sync on public.profiles;
create trigger on_profile_name_sync after update of name on public.profiles
  for each row execute function public.sync_staff_names();

update public.teams t set chair_name = p.name
from public.profiles p where p.role = 'chair' and p.team_id = t.id and t.chair_name is distinct from p.name;
update public.teams t set coach_name = c.names
from (select team_id, string_agg(name, ', ' order by name) names from public.profiles where role = 'coach' and team_id is not null group by team_id) c
where c.team_id = t.id and t.coach_name is distinct from c.names;
