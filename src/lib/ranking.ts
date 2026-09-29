// Player leaderboard: goals, assists, saves and consistency, from finished matches.
import { ovrOf } from './league';
import type { Match, Participation, Player } from './types';

export type RankKey = 'goals' | 'assists' | 'saves' | 'stability' | 'growth';

export const RANK_COLS: { key: RankKey; label: string; short: string; icon: string; unit: string; hint: string }[] = [
  { key: 'growth', label: 'Tiến bộ', short: 'TB', icon: '🚀', unit: 'điểm chỉ số', hint: 'Tổng điểm chỉ số đã tăng nhờ kinh nghiệm so với chỉ số khởi điểm (bằng điểm thì ai nhiều XP hơn xếp trên)' },
  { key: 'goals', label: 'Bàn thắng', short: 'BÀN', icon: '⚽', unit: 'bàn', hint: 'Mỗi trận lấy số lớn hơn giữa danh sách ghi bàn của BTC và thống kê đã duyệt' },
  { key: 'assists', label: 'Kiến tạo', short: 'KT', icon: '🎯', unit: 'kiến tạo', hint: 'Theo thống kê cá nhân đã được BHL duyệt' },
  { key: 'saves', label: 'Cản phá', short: 'CP', icon: '🧤', unit: 'pha cản phá', hint: 'Theo thống kê cá nhân đã được BHL duyệt' },
  { key: 'stability', label: 'Độ ổn định', short: 'ỔĐ', icon: '📈', unit: 'điểm', hint: 'Điểm TB trừ độ dao động, cần ít nhất 3 trận có điểm' },
];

export interface RankRow {
  player: Player;
  apps: number;
  goals: number;
  assists: number;
  saves: number;
  rating: number | null;
  /** Average rating minus its standard deviation (0–10); null with fewer than 3 rated matches. */
  stability: number | null;
  /** Stat points gained since the starting stats, and the OVR gained. */
  growth: number;
  ovrUp: number;
}

export const MIN_RATED = 3;

/** Only players who belong to a team are ranked. */
export function playerRanking(players: Player[], matches: Match[], parts: Participation[]): RankRow[] {
  const done = new Map(matches.filter((m) => m.status === 'done').map((m) => [m.id, m]));
  const rows = new Map<string, RankRow & { ratings: number[]; matchIds: Set<string> }>();
  players.filter((p) => p.teamId).forEach((p) => {
    const base = p.baseStats?.length === 6 ? p.baseStats : p.stats;
    const growth = p.stats.reduce((a, v, i) => a + Math.max(0, v - base[i]), 0);
    rows.set(p.id, { player: p, apps: 0, goals: 0, assists: 0, saves: 0, rating: null, stability: null, growth, ovrUp: p.ovr - ovrOf(p.pos, base), ratings: [], matchIds: new Set() });
  });

  // Goals per match: max(admin scorer list, approved self-report) — never counted twice.
  const perMatch = new Map<string, number>();
  done.forEach((m) => (m.scorers || []).forEach((g) => perMatch.set(m.id + '|' + g.pid, (perMatch.get(m.id + '|' + g.pid) ?? 0) + 1)));
  parts.forEach((x) => {
    const r = rows.get(x.playerId);
    if (!r || !done.has(x.matchId) || x.status !== 'approved') return;
    r.matchIds.add(x.matchId);
    r.assists += x.assists ?? 0;
    r.saves += x.saves ?? 0;
    if (x.rating != null) r.ratings.push(Number(x.rating));
    const k = x.matchId + '|' + x.playerId;
    perMatch.set(k, Math.max(perMatch.get(k) ?? 0, x.goals ?? 0));
  });
  perMatch.forEach((v, k) => {
    const [mid, pid] = k.split('|');
    const r = rows.get(pid);
    if (!r) return;
    r.goals += v;
    if (v > 0) r.matchIds.add(mid);
  });

  return [...rows.values()].map(({ ratings, matchIds, ...r }) => {
    const n = ratings.length;
    const avg = n ? ratings.reduce((a, b) => a + b, 0) / n : null;
    const sd = n ? Math.sqrt(ratings.reduce((a, b) => a + (b - avg!) ** 2, 0) / n) : 0;
    return { ...r, apps: matchIds.size, rating: avg, stability: n >= MIN_RATED ? Math.max(0, Math.round((avg! - sd) * 10) / 10) : null };
  });
}

/** Sort by one metric (desc); players without a value go last. Ties: fewer matches, then name. */
export function sortRanking(rows: RankRow[], key: RankKey) {
  const v = (r: RankRow) => r[key] ?? -1;
  const tie = (a: RankRow, b: RankRow) => (key === 'growth' ? (b.player.xp ?? 0) - (a.player.xp ?? 0) : a.apps - b.apps);
  return rows.slice().sort((a, b) => v(b) - v(a) || tie(a, b) || a.player.name.localeCompare(b.player.name, 'vi'));
}

export const fmtRank = (r: RankRow, key: RankKey) =>
  key === 'stability' ? (r.stability == null ? '—' : r.stability.toFixed(1)) : key === 'growth' ? (r.growth ? '+' + r.growth : '0') : String(r[key]);
