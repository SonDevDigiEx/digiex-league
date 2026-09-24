-- Run AFTER creating the users in Authentication → Users → "Add user" (tick "Auto Confirm User"):
--   admin@digiex.group, son.f8@digiex.group, hlv.f8@digiex.group,
--   vinh.f9@digiex.group, hlv.f9@digiex.group, member@digiex.group
-- Each new user gets a 'member' profile automatically; this sets names, roles and teams,
-- then adds the two demo transfer offers. Safe to run more than once.

update public.profiles p set name = v.name, role = v.role, team_id = v.team
from (values
  ('admin',   'Ban tổ chức',       'admin',  null),
  ('son.f8',  'Nguyễn Thanh Sơn',  'chair',  'f8'),
  ('hlv.f8',  'Phạm Đức Hùng',     'coach',  'f8'),
  ('vinh.f9', 'Lê Quang Vinh',     'chair',  'f9'),
  ('hlv.f9',  'Trần Minh Đạo',     'coach',  'f9'),
  ('member',  'Nhân viên DigiEx',  'member', null)
) as v(username, name, role, team)
where p.username = v.username;

insert into public.offers (player_id, buyer_team, seller_team, price, value, note, created_by, status, created_on)
select v.pid, v.buyer, v.seller, v.price, pl.value, v.note, pr.id, 'pending', v.d::date
from (values
  ('p28', 'f8', 'f9', 40, 'F8 cần một trung phong đẳng cấp cho trận derby tháng 10.', 'son.f8',  '2026-09-20'),
  ('p6',  'f9', 'f8', 30, '',                                                       'vinh.f9', '2026-09-22')
) as v(pid, buyer, seller, price, note, by_user, d)
join public.players pl on pl.id = v.pid and pl.team_id = v.seller
join public.profiles pr on pr.username = v.by_user
where not exists (select 1 from public.offers o where o.player_id = v.pid and o.buyer_team = v.buyer);

select username, name, role, team_id from public.profiles order by role, username;
