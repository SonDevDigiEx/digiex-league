// XP quests → stat growth. The server (supabase/migrations/20260928170000_xp.sql) awards XP;
// this file only mirrors the rules for display and computes levels / tips.
import { GROUP, LBL, LBL_GK, POS_WEIGHTS } from './league';
import type { Match, Participation, Player } from './types';

/** XP needed for +1 on a stat that is currently v (≈ +10 % per point). */
export const xpCost = (v: number) => Math.max(5, Math.round(12 * Math.pow(1.1, v - 60)));

export interface Rule { icon: string; title: string; xp: string; who?: string; goes: string; kind: string }
export const RULES: Rule[] = [
  { kind: 'attend', icon: '✅', title: 'Có mặt thi đấu (đã bấm “Tham gia”)', xp: '+20', goes: 'Chia theo vị trí' },
  { kind: 'stats', icon: '📝', title: 'Tự điền thông số sau trận, được BHL duyệt', xp: '+10', goes: 'Chia theo vị trí' },
  { kind: 'win', icon: '🏆', title: 'Thắng trận / Hòa', xp: '+8 / +4', goes: 'Chia theo vị trí' },
  { kind: 'goals', icon: '⚽', title: 'Mỗi bàn thắng', xp: '+16', goes: 'SHO +12 · DRI +4' },
  { kind: 'assists', icon: '🎯', title: 'Mỗi kiến tạo', xp: '+16', goes: 'PAS +12 · DRI +4' },
  { kind: 'clean_sheet', icon: '🧱', title: 'Giữ sạch lưới', xp: '+20 / +6', who: 'Thủ môn, Hậu vệ / Tiền vệ', goes: 'GK: DIV HAN REF POS · HV: DEF +15 PHY +5 · TV: DEF +6' },
  { kind: 'tight', icon: '🛡️', title: 'Chỉ thủng lưới 1 bàn', xp: '+6', who: 'Thủ môn, Hậu vệ', goes: 'DEF (GK: DIV HAN REF)' },
  { kind: 'saves', icon: '🧤', title: 'Mỗi pha cản phá (tối đa 10/trận)', xp: '+3', who: 'Thủ môn', goes: 'DIV · REF' },
  { kind: 'rating', icon: '⭐', title: 'Điểm trận ≥ 8 / ≥ 9', xp: '+10 / +20', goes: 'Chia theo vị trí' },
  { kind: 'mom', icon: '🏅', title: 'Cầu thủ xuất sắc trận (MOM)', xp: '+25', goes: 'Chia theo vị trí' },
  { kind: 'streak', icon: '🔥', title: 'Chuỗi 3 trận liên tiếp của đội đều có mặt', xp: '+15', goes: 'Chia theo vị trí' },
  { kind: 'bonus', icon: '🧧', title: 'Thưởng nóng từ Chủ tịch (1 phong bì/tuần/Chủ tịch)', xp: '+30', goes: 'Chia theo vị trí' },
  { kind: 'absent', icon: '😴', title: 'Vắng trận của đội (khi đội có ≥ 3 người bấm Tham gia)', xp: '−6', goes: 'Chỉ trừ tiến độ, không tụt chỉ số' },
];
export const RULE_ICON: Record<string, string> = Object.fromEntries(RULES.map((r) => [r.kind, r.icon]));
RULE_ICON.draw = '🤝';

/** Player level from lifetime XP: level L starts at 40·(L−1)² XP. */
export function level(xp: number) {
  const L = Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
  const from = 40 * (L - 1) ** 2, to = 40 * L ** 2;
  return { level: L, from, to, pct: Math.min(100, ((xp - from) / (to - from)) * 100), title: TITLES.filter((t) => L >= t[0]).pop()![1] };
}
const TITLES: [number, string][] = [[1, 'Tân binh'], [3, 'Cầu thủ phong trào'], [5, 'Trụ cột'], [8, 'Ngôi sao sân cỏ'], [12, 'Huyền thoại'], [16, 'Thánh sống']];

/** Progress of each stat toward its next point. */
export function statProgress(p: Player) {
  return p.stats.map((v, i) => {
    const have = p.statXp?.[i] ?? 0, need = xpCost(v);
    return { v, have, need, pct: v >= 99 ? 100 : Math.min(100, (have / need) * 100) };
  });
}

/** Personal suggestions for the player's detail page. */
export function tips(p: Player, matches: Match[], parts: Participation[]): string[] {
  const g = GROUP[p.pos];
  const L = p.pos === 'GK' ? LBL_GK : LBL;
  const w = POS_WEIGHTS[p.pos];
  const out: string[] = [];
  // Unfilled stats for finished matches = free XP.
  const done = new Set(matches.filter((m) => m.status === 'done').map((m) => m.id));
  const todo = parts.filter((x) => x.playerId === p.id && done.has(x.matchId) && (x.status === 'none' || x.status === 'rejected')).length;
  if (todo) out.push(`📝 Bạn còn ${todo} trận chưa điền thông số — điền ngay để BHL duyệt, mỗi trận +10 XP (cộng thêm bàn, kiến tạo, cản phá).`);
  // Closest stat to level up, among the ones that matter for the position.
  const prog = statProgress(p).map((s, i) => ({ ...s, i, left: s.need - s.have })).filter((s) => w[s.i] > 0.1 && s.v < 99).sort((a, b) => a.left - b.left);
  if (prog[0]) out.push(`📈 ${L[prog[0].i]} chỉ còn ${prog[0].left} XP nữa là lên ${prog[0].v + 1}.`);
  out.push('✅ Bấm “Tham gia” mỗi trận của đội: +20 XP chỉ vì có mặt, đá liền 3 trận thưởng thêm +15. Vắng trận bị trừ 6 XP.');
  if (g === 'GK') out.push('🧤 Thủ môn: giữ sạch lưới +20, chỉ thủng 1 bàn +6, mỗi pha cản phá +3 (nhớ ghi số cản phá khi điền thông số).');
  else if (g === 'DEF') out.push('🧱 Hậu vệ: giữ sạch lưới +20 (DEF, PHY), thủng ≤ 1 bàn +6; kiến tạo cũng được +16 (PAS).');
  else if (g === 'MID') out.push('🎯 Tiền vệ: mỗi kiến tạo +16 (PAS), ghi bàn +16 (SHO), đội giữ sạch lưới +6 DEF.');
  else out.push('⚽ Tiền đạo: mỗi bàn +16 (SHO, DRI), kiến tạo +16 (PAS); đá hay để được MOM +25.');
  out.push('⭐ Điểm trận ≥ 8 được +10, ≥ 9 được +20 — MOM thêm +25.');
  out.push('🤫 Mẹo không chính thức: đi đêm với Chủ tịch CLB — mỗi tuần Chủ tịch có đúng 1 phong bì “thưởng nóng” +30 XP. Cà phê sáng, xách nước, nhặt bóng… tùy tâm 😏');
  return out;
}

export interface Quest { icon: string; text: string; xp: string; matchId?: string }

/** The next concrete things the player can do to earn XP (most valuable first). */
export function nextQuests(p: Player, matches: Match[], parts: Participation[], now = Date.now()): Quest[] {
  const out: Quest[] = [];
  const mine = parts.filter((x) => x.playerId === p.id);
  const joined = new Set(mine.map((x) => x.matchId));
  const involves = (m: Match) => !p.teamId || m.home === p.teamId || m.away === p.teamId;
  const up = matches.filter((m) => m.status === 'up' && involves(m) && new Date(m.date).getTime() > now - 2 * 3600e3)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextUp = up.find((m) => !joined.has(m.id));
  if (nextUp) out.push({ icon: '✅', text: `Bấm “Tham gia” trận ${fmtDay(nextUp.date)}`, xp: '+20', matchId: nextUp.id });
  const done = new Map(matches.filter((m) => m.status === 'done').map((m) => [m.id, m]));
  mine.filter((x) => done.has(x.matchId) && (x.status === 'none' || x.status === 'rejected'))
    .sort((a, b) => done.get(b.matchId)!.date.localeCompare(done.get(a.matchId)!.date)).slice(0, 2)
    .forEach((x) => out.push({ icon: '📝', text: `Điền thông số trận ${fmtDay(done.get(x.matchId)!.date)}`, xp: '+10', matchId: x.matchId }));
  // Streak: played the team's last 2 finished matches → the next one completes 3 in a row.
  if (p.teamId) {
    const last2 = [...done.values()].filter((m) => m.home === p.teamId || m.away === p.teamId).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    if (last2.length === 2 && last2.every((m) => joined.has(m.id)) && up[0]) out.push({ icon: '🔥', text: 'Đá tiếp trận tới để hoàn thành chuỗi 3 trận', xp: '+15', matchId: up[0].id });
  }
  const g = GROUP[p.pos];
  out.push(g === 'GK' ? { icon: '🧤', text: 'Giữ sạch lưới trận tới', xp: '+20' }
    : g === 'DEF' ? { icon: '🧱', text: 'Cùng hàng thủ giữ sạch lưới', xp: '+20' }
    : g === 'MID' ? { icon: '🎯', text: 'Có 1 kiến tạo trận tới', xp: '+16' }
    : { icon: '⚽', text: 'Ghi 1 bàn trận tới', xp: '+16' });
  return out;
}
const fmtDay = (iso: string) => { const d = new Date(iso); return `${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`; };
