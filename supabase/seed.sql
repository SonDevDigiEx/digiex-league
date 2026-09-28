-- Starting teams. Players, fixtures and people are entered through the app.
insert into public.teams (id, name, short, color, color2, motto, founded, chair_quote) values
  ('f8', 'F8 Warriors', 'F8', '#ff3b5c', '#7a0f24', 'Không lùi bước, máu lửa từ phút đầu tiên', 2024, 'Chơi hết mình, thắng bằng tinh thần.'),
  ('f9', 'F9 Titans',   'F9', '#2f8cff', '#0b2a66', 'Kỷ luật tạo nên chiến thắng',              2024, 'Mỗi trận là một bài test hệ thống.')
on conflict (id) do nothing;
