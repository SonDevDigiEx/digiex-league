-- Seed: Giải Giao Hữu Sân 7 — F8 vs F9, Wednesday 30/09/2026 18:15 (giờ VN) at Sân VOV.
-- Requires the tournaments migrations (update-2026-09-28-tournaments.sql).
-- Safe to re-run: fixed ids + on conflict do nothing.

insert into public.tournaments (id, name, format, structure, group_count, status, starts_on, ends_on, settings, rules_md, drawn_at)
values (
  'giao-huu-s7-2026', 'Giải Giao Hữu Sân 7', 's7', 'league', 1, 'upcoming', '2026-09-30', '2026-09-30',
  '{"weeks":1,"stages":1,"squadMin":10,"squadMax":12,"starters":7,"halves":2,"halfMin":"25–30",
    "pts":{"win":3,"draw":1,"loss":0,"shootoutWin":2,"shootoutLoss":1,"closeLossBonus":1,"noShow":-1},
    "personal":{"attend":2,"goal":2,"assist":1,"mvp":3,"cleanSheet":3,"absent":-3}}'::jsonb,
  $rules$# ⚽ Giải Giao Hữu Sân 7 — Thể Lệ

> Trận giao hữu F8 vs F9 khởi động mùa giải nội bộ.
>
> Mục tiêu số 1: **vui, fair-play, không chấn thương.**

---

## 1. Thông tin trận đấu

| Hạng mục | Quy định |
|---|---|
| Thời gian | **18:15 thứ Tư, 30/09/2026** (có mặt trước 15 phút) |
| Địa điểm | **Sân VOV** |
| Đội tham dự | F8 Warriors vs F9 Titans |
| Quân số mỗi đội | 10–12 người (7 đá chính + dự bị) |
| Thời lượng | 2 hiệp × 25–30 phút, tuỳ giờ thuê sân |
| Thay người | Không giới hạn, thay tự do khi bóng chết |

---

## 2. Phân định thắng thua

| Kết quả | Cách xử lý |
|---|---|
| Thắng sau 2 hiệp | Đội thắng nhận **3 điểm** |
| Hòa sau 2 hiệp | Đá luân lưu 5 quả: thắng **2 điểm**, thua **1 điểm** |
| Thua cách biệt ≤ 1 bàn | +1 điểm an ủi |

---

## 3. Điểm cá nhân

Được ghi nhận vào hồ sơ cầu thủ sau khi BHL duyệt thống kê trận.

| Thành tích | Điểm |
|---|---|
| Có mặt thi đấu | 2 |
| Ghi bàn | 2 |
| Kiến tạo | 1 |
| MVP trận (2 đội trưởng + trọng tài bình chọn) | 3 |
| Thủ môn giữ sạch lưới | 3 |

---

## 4. Lưu ý

- Bấm **"Tham gia"** ở trận đấu trên app để BHL xếp đội hình.
- Tiền sân chia đều cho những người đi đá.
- Đội thua góp thêm 20k/người vào quỹ liên hoan.
- Sau trận: mỗi cầu thủ tự điền bàn thắng / kiến tạo, BHL duyệt.
$rules$,
  now()
)
on conflict (id) do nothing;

insert into public.tournament_teams (tournament_id, team_id, seed)
values ('giao-huu-s7-2026', 'f8', 1), ('giao-huu-s7-2026', 'f9', 2)
on conflict do nothing;

insert into public.matches (id, kickoff, home_team, away_team, venue, tournament_id, stage)
values ('giao-huu-s7-2026-m1', '2026-09-30 18:15:00+07', 'f8', 'f9', 'Sân VOV', 'giao-huu-s7-2026', 'Giao hữu')
on conflict (id) do nothing;
