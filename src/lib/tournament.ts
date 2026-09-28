// Tournament templates (S5 / S7), rules text, standings and award suggestions.
import type { Match, Participation, Player, TournamentSettings } from './types';

export type Format = 's5' | 's7';
export type Structure = 'league' | 'groups' | 'knockout';
export type AwardKind = 'champion' | 'runner_up' | 'top_scorer' | 'top_assist' | 'mvp' | 'golden_glove' | 'attendance' | 'custom';

export const STRUCTURE_LABEL: Record<Structure, string> = {
  league: 'Vòng tròn tính điểm',
  groups: 'Chia bảng → loại trực tiếp',
  knockout: 'Loại trực tiếp',
};
export const STATUS_LABEL = { upcoming: 'SẮP KHỞI TRANH', ongoing: 'ĐANG DIỄN RA', finished: 'ĐÃ KẾT THÚC' } as const;

export const AWARD_KINDS: { kind: AwardKind; icon: string; title: string; team?: boolean }[] = [
  { kind: 'champion', icon: '🏆', title: 'Đội vô địch', team: true },
  { kind: 'runner_up', icon: '🥈', title: 'Á quân', team: true },
  { kind: 'top_scorer', icon: '👟', title: 'Vua phá lưới' },
  { kind: 'top_assist', icon: '🎯', title: 'Vua kiến tạo' },
  { kind: 'mvp', icon: '⭐', title: 'Cầu thủ xuất sắc mùa' },
  { kind: 'golden_glove', icon: '🧤', title: 'Găng tay vàng' },
  { kind: 'attendance', icon: '📅', title: 'Chuyên cần' },
  { kind: 'custom', icon: '🎖️', title: 'Giải đặc biệt' },
];
export const awardIcon = (k: string) => AWARD_KINDS.find((a) => a.kind === k)?.icon ?? '🎖️';

export const TEMPLATES: Record<Format, TournamentSettings> = {
  s7: {
    weeks: 24, stages: 2, squadMin: 10, squadMax: 12, starters: 7, halves: 2, halfMin: '25–30',
    pts: { win: 3, draw: 1, loss: 0, shootoutWin: 2, shootoutLoss: 1, closeLossBonus: 1, noShow: -1 },
    personal: { attend: 2, goal: 2, assist: 1, mvp: 3, cleanSheet: 3, absent: -3 },
  },
  s5: {
    weeks: 24, stages: 2, squadMin: 7, squadMax: 9, starters: 5, halves: 2, halfMin: '20–25',
    pts: { win: 3, draw: 1, loss: 0, shootoutWin: 2, shootoutLoss: 1, closeLossBonus: 1, noShow: -1 },
    personal: { attend: 2, goal: 2, assist: 1, mvp: 3, cleanSheet: 3, absent: -3 },
  },
};

/** Full rules (Markdown) built from the template numbers — based on "Thể lệ giải sân 7 nội bộ". */
export function rulesTemplate(format: Format, s: TournamentSettings, name: string) {
  const court = format === 's5' ? 'Sân 5' : 'Sân 7';
  const stageWeeks = Math.round(s.weeks / Math.max(1, s.stages));
  return `# ⚽ ${name || `Giải ${court} Nội Bộ`} — Thể Lệ Mùa Giải

> Giải đấu nội bộ thi đấu hàng tuần, tích điểm để tổ chức liên hoan định kỳ và có kỳ chuyển nhượng cầu thủ vào cuối mùa.
>
> Mục tiêu số 1 của giải: **vui, đều đặn, và các đội luôn cân sức.**

---

## 1. Khung mùa giải

| Hạng mục | Quy định |
|---|---|
| Độ dài mùa | ${s.weeks} tuần, chia ${s.stages} chặng, mỗi chặng ${stageWeeks} tuần |
| Liên hoan | Cuối mỗi chặng (tuần ${Array.from({ length: s.stages }, (_, i) => stageWeeks * (i + 1)).join(' và tuần ')}) |
| Chuyển nhượng | Kỳ chuyển nhượng mở ngay sau liên hoan cuối mùa, kéo dài 1 tuần |
| Quân số mỗi đội | ${s.squadMin}–${s.squadMax} người (${s.starters} đá chính + dự bị để bù người vắng) |
| Thời lượng trận | ${s.halves} hiệp × ${s.halfMin} phút, tuỳ giờ thuê sân |

---

## 2. Chia đội ban đầu

Để các đội cân sức và tránh tình trạng "hội chơi thân vs phần còn lại", đội hình được chia bằng **draft**, không tự chọn phe.

| Bước | Cách làm |
|---|---|
| 1. Xếp hạng | BTC xếp tất cả vào 3 tier: A (mạnh), B, C. Thủ môn tách riêng |
| 2. Chọn đội trưởng | Mỗi đội 1 người ở tier A, trình độ tương đương |
| 3. Draft rắn | Đội 1 chọn 1 → Đội 2 chọn 2 → Đội 1 chọn 2... (kiểu 1-2-2-2) |
| 4. Thủ môn | Tung đồng xu hoặc chọn riêng trước |

---

## 3. Hệ thống tính điểm

### 3.1. Điểm đội (hàng tuần)

| Kết quả | Điểm |
|---|---|
| Thắng | ${s.pts.win} |
| Hòa → đá luân lưu 5 quả | Thắng luân lưu: ${s.pts.shootoutWin} — Thua luân lưu: ${s.pts.shootoutLoss} |
| Thua | ${s.pts.loss} |
| Thua cách biệt ≤ 1 bàn | +${s.pts.closeLossBonus} điểm an ủi |
| Đội thiếu người mà không báo trước 24h | ${s.pts.noShow} |

- Không có kết quả hòa thuần: tuần nào cũng phân định thắng thua.
- Điểm an ủi khi thua sát nút giúp cuộc đua điểm không bị bỏ xa quá sớm.

### 3.2. Luật cân bằng giữa chặng

Nếu sau ${Math.round(stageWeeks / 2)} tuần mà một đội dẫn **≥ 10 điểm**, đội đang dẫn phải **cho đội kia mượn 1 cầu thủ** (đội kia được chọn, trừ đội trưởng) đến hết chặng.

### 3.3. Điểm cá nhân

Điểm cá nhân được dùng để xét giải thưởng và làm **"giá trị cầu thủ"** trong kỳ chuyển nhượng.

| Thành tích | Điểm |
|---|---|
| Có mặt thi đấu | ${s.personal.attend} |
| Ghi bàn | ${s.personal.goal} |
| Kiến tạo | ${s.personal.assist} |
| MVP trận (các đội trưởng + trọng tài bình chọn) | ${s.personal.mvp} |
| Thủ môn giữ sạch lưới | ${s.personal.cleanSheet} |
| Vắng không báo | ${s.personal.absent} |

> Điểm chuyên cần được tính cao có chủ đích: giải nội bộ sống được là nhờ mọi người đi đá đều.

---

## 4. Quỹ và liên hoan

| Khoản | Cách thu |
|---|---|
| Tiền sân | Chia đều cho những người đi đá tuần đó |
| Quỹ liên hoan | Mỗi người đóng cố định hàng tháng (dự kiến 50–100k) |
| Tiền "thua trận" | Đội thua mỗi tuần góp thêm vào quỹ (dự kiến 20k/người) |
| Chia tiền liên hoan | Nếu chi phí vượt quỹ: đội thua chặng gánh 60–70% phần vượt, đội thắng 30–40% |

- Có **1 thủ quỹ** phụ trách thu chi.
- Thu chi được cập nhật **công khai** và báo cáo lên group hàng tháng.

---

## 5. Giải thưởng cuối chặng / cuối mùa

| Giải | Tiêu chí |
|---|---|
| 🏆 Đội vô địch chặng | Tổng điểm đội |
| 👟 Vua phá lưới | Số bàn thắng |
| 🎯 Vua kiến tạo | Số kiến tạo |
| ⭐ Cầu thủ xuất sắc mùa | Tổng điểm cá nhân |
| 🧤 Găng tay vàng | Số trận giữ sạch lưới |
| 📅 Chuyên cần | Số trận có mặt |

Giải thưởng mang tính vui là chính: cúp, áo in chữ, hoặc quà nhỏ.

---

## 6. Kỳ chuyển nhượng cuối mùa

Mục tiêu của kỳ chuyển nhượng là **cân bằng lại các đội** cho mùa sau, không phải để đội mạnh mạnh thêm.

| Luật | Chi tiết |
|---|---|
| Ngân sách "coin" ảo | Đội thua mùa nhận 120 coin, đội vô địch nhận 80 coin |
| Giá cầu thủ | Bằng tổng điểm cá nhân của mùa vừa rồi |
| Bảo vệ | Mỗi đội được "khoá" 3 cầu thủ, đội kia không được mua |
| Giới hạn | Tối đa 2 thương vụ mỗi đội mỗi mùa |
| Hình thức | Mua bằng coin, hoặc đổi 1-1 kèm bù coin |
| Quyền cầu thủ | Mỗi cầu thủ được từ chối chuyển đi 1 lần |
| Tân binh | Draft riêng, đội thua mùa được chọn trước |
| Công bố | Chốt deal trong buổi liên hoan cuối mùa |

---

*Các con số trong thể lệ (mức đóng quỹ, ngưỡng điểm, ngân sách coin...) là đề xuất ban đầu và có thể điều chỉnh sau khi cả team góp ý.*
`;
}

export interface Row { team: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }

/** Tournament standings using the tournament's points (incl. +1 for losing by one goal). */
export function tournamentTable(teamIds: string[], matches: Match[], s: TournamentSettings): Row[] {
  const rows = new Map(teamIds.map((t) => [t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  matches.filter((m) => m.status === 'done').forEach((m) => {
    const h = rows.get(m.home), a = rows.get(m.away);
    if (!h || !a) return;
    const apply = (r: Row, gf: number, ga: number) => {
      r.p++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; r.pts += s.pts.win; } else if (gf < ga) { r.l++; r.pts += s.pts.loss + (ga - gf === 1 ? s.pts.closeLossBonus : 0); } else { r.d++; r.pts += s.pts.draw; }
    };
    apply(h, m.hs, m.as); apply(a, m.as, m.hs);
  });
  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
}

export interface Leader { playerId: string; value: number }

/** Award suggestions from approved stats of the tournament's matches. */
export function awardSuggestions(matches: Match[], parts: Participation[], players: Player[], s: TournamentSettings) {
  const done = new Map(matches.filter((m) => m.status === 'done').map((m) => [m.id, m]));
  const ok = parts.filter((x) => x.status === 'approved' && done.has(x.matchId));
  const pos = new Map(players.map((p) => [p.id, p.pos]));
  const agg = new Map<string, { goals: number; assists: number; apps: number; clean: number; points: number }>();
  ok.forEach((x) => {
    const m = done.get(x.matchId)!;
    const conceded = x.teamId === m.home ? m.as : m.hs;
    const a = agg.get(x.playerId) ?? { goals: 0, assists: 0, apps: 0, clean: 0, points: 0 };
    const clean = pos.get(x.playerId) === 'GK' && conceded === 0 ? 1 : 0;
    a.goals += x.goals ?? 0; a.assists += x.assists ?? 0; a.apps += 1; a.clean += clean;
    a.points += s.personal.attend + (x.goals ?? 0) * s.personal.goal + (x.assists ?? 0) * s.personal.assist + clean * s.personal.cleanSheet;
    agg.set(x.playerId, a);
  });
  const top = (k: 'goals' | 'assists' | 'apps' | 'clean' | 'points'): Leader | null => {
    let best: Leader | null = null;
    agg.forEach((v, id) => { if (v[k] > 0 && (!best || v[k] > best.value)) best = { playerId: id, value: v[k] }; });
    return best;
  };
  return { top_scorer: top('goals'), top_assist: top('assists'), attendance: top('apps'), golden_glove: top('clean'), mvp: top('points') };
}
