-- One-time cleanup of the demo data on an existing project.
-- Keeps teams F8 and F9 (name, colours, motto, logo); deletes all players, matches, votes,
-- transfers and offers, and removes the six demo accounts.
-- Run in Supabase SQL Editor AFTER migrations/20260928000000_production.sql.
-- ⚠ Irreversible: only run it before real data has been entered.

begin;

delete from public.offers;
delete from public.transfers;
delete from public.votes;
delete from public.matches;
delete from public.players;
delete from public.teams where id not in ('f8', 'f9');

update public.teams set
  chair_name  = 'Chưa bổ nhiệm',
  chair_since = extract(year from now())::text,
  chair_quote = 'Hành trình mới bắt đầu.',
  coach_name  = 'Chưa bổ nhiệm';

delete from auth.users where email in (
  'admin@digiex.group', 'son.f8@digiex.group', 'hlv.f8@digiex.group',
  'vinh.f9@digiex.group', 'hlv.f9@digiex.group', 'member@digiex.group'
);

-- Anyone listed as bootstrap admin who already has an account becomes admin now.
update public.profiles p set role = 'admin', team_id = null
from public.bootstrap_admins b where lower(p.email) = b.email;

commit;

select (select count(*) from public.teams) as teams, (select count(*) from public.players) as players,
       (select count(*) from public.matches) as matches, (select count(*) from auth.users) as users;
