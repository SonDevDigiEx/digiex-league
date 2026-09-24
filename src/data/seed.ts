// Demo league used by local mode and by scripts/gen-seed-sql.ts (Supabase seed).
import { DEFAULT_VENUE, genStats, rng, valOf } from '../lib/league';
import type { Foot, Goal, Match, Offer, Player, Pos, Role, Team, Transfer } from '../lib/types';

type Row = [name: string, pos: Pos, ovr: number, num: number, age: number];

function mkP(id: string, teamId: string, [name, pos, ovr, num, age]: Row, seed: number): Player {
  const r = rng(seed * 7 + 3);
  const foot: Foot = r() > 0.75 ? 'Trái' : 'Phải';
  return { id, teamId, name, pos, ovr, num, age, foot, stats: genStats(pos, ovr, seed * 13 + 5), value: valOf(ovr), photo: null };
}

function genScorers(players: Player[], m: Pick<Match, 'hs' | 'as' | 'home' | 'away'>, seed: number): Goal[] {
  const r = rng(seed);
  const out: Goal[] = [];
  ([['home', m.hs, m.home], ['away', m.as, m.away]] as const).forEach(([side, n, tid]) => {
    const c = players.filter((p) => p.teamId === tid && p.pos !== 'GK');
    if (!c.length) return;
    const w = c.map((p) => Math.pow(p.stats[1], 3));
    const tot = w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) {
      let x = r() * tot, k = 0;
      while (x > w[k] && k < c.length - 1) { x -= w[k]; k++; }
      out.push({ pid: c[k].id, side, min: 2 + Math.floor(r() * 68) });
    }
  });
  return out.sort((a, b) => a.min - b.min);
}

export interface SeedUser { u: string; name: string; role: Role; team?: string }

export const SEED_USERS: SeedUser[] = [
  { u: 'admin', name: 'Ban tổ chức', role: 'admin' },
  { u: 'son.f8', name: 'Nguyễn Thanh Sơn', role: 'chair', team: 'f8' },
  { u: 'hlv.f8', name: 'Phạm Đức Hùng', role: 'coach', team: 'f8' },
  { u: 'vinh.f9', name: 'Lê Quang Vinh', role: 'chair', team: 'f9' },
  { u: 'hlv.f9', name: 'Trần Minh Đạo', role: 'coach', team: 'f9' },
  { u: 'member', name: 'Nhân viên DigiEx', role: 'member' },
];

export interface SeedData {
  teams: Team[];
  players: Player[];
  matches: Match[];
  transfers: Transfer[];
  offers: (Omit<Offer, 'byName'> & { by: string })[];
}

export function seedData(): SeedData {
  const teams: Team[] = [
    { id: 'f8', name: 'F8 Warriors', short: 'F8', color: '#ff3b5c', color2: '#7a0f24', motto: 'Không lùi bước, máu lửa từ phút đầu tiên', founded: 2024, chair: { name: 'Nguyễn Thanh Sơn', since: '2024', quote: 'Chơi hết mình, thắng bằng tinh thần.' }, coach: { name: 'Phạm Đức Hùng' }, logo: null },
    { id: 'f9', name: 'F9 Titans', short: 'F9', color: '#2f8cff', color2: '#0b2a66', motto: 'Kỷ luật tạo nên chiến thắng', founded: 2024, chair: { name: 'Lê Quang Vinh', since: '2024', quote: 'Mỗi trận là một bài test hệ thống.' }, coach: { name: 'Trần Minh Đạo' }, logo: null },
  ];
  const f8: Row[] = [['Trần Đức Anh', 'GK', 81, 1, 29], ['Lê Hoàng Nam', 'CB', 79, 4, 31], ['Phạm Quốc Bảo', 'CB', 76, 5, 27], ['Vũ Thành Long', 'LB', 74, 3, 25], ['Đỗ Minh Khoa', 'CDM', 80, 6, 30], ['Nguyễn Hữu Phúc', 'CM', 83, 8, 28], ['Bùi Gia Huy', 'CAM', 87, 10, 26], ['Hoàng Anh Tú', 'RW', 78, 7, 24], ['Đặng Văn Quyết', 'ST', 91, 9, 27], ['Ngô Tiến Dũng', 'LW', 72, 11, 23], ['Lâm Chí Thanh', 'CM', 68, 14, 35]];
  const f9: Row[] = [['Phan Văn Hậu', 'GK', 83, 1, 32], ['Trịnh Quang Hải', 'CB', 82, 4, 29], ['Lý Công Minh', 'CB', 75, 2, 26], ['Mai Xuân Trường', 'RB', 73, 12, 24], ['Dương Thế Vinh', 'CDM', 78, 6, 28], ['Cao Đức Thắng', 'CM', 85, 8, 27], ['Hồ Tấn Tài', 'CAM', 80, 10, 25], ['Tô Hoàng Lâm', 'LW', 77, 11, 23], ['Lương Công Phượng', 'ST', 89, 9, 30], ['Kiều Nhật Minh', 'RW', 84, 7, 26], ['Võ Đình Khôi', 'ST', 66, 19, 22]];
  const players = [...f8.map((x, i) => mkP('p' + i, 'f8', x, i + 1)), ...f9.map((x, i) => mkP('p' + (20 + i), 'f9', x, i + 31))];
  // Kick-off times are Vietnam local time (UTC+7).
  const raw: [string, string, string, number, number][] = [['2026-01-10T18:00', 'f8', 'f9', 3, 2], ['2026-02-07T18:00', 'f9', 'f8', 1, 1], ['2026-03-07T18:00', 'f8', 'f9', 0, 2], ['2026-04-04T18:00', 'f9', 'f8', 4, 3], ['2026-05-09T18:30', 'f8', 'f9', 2, 1], ['2026-06-06T18:30', 'f9', 'f8', 2, 2], ['2026-07-11T18:30', 'f8', 'f9', 3, 1], ['2026-08-08T18:30', 'f9', 'f8', 1, 2], ['2026-09-12T18:30', 'f8', 'f9', 1, 3]];
  const matches: Match[] = raw.map(([date, home, away, hs, as], i) => {
    const r = rng(i * 17 + 9);
    const m: Match = {
      id: 'm' + i, date: date + ':00+07:00', home, away, hs, as, status: 'done', venue: DEFAULT_VENUE,
      votes: { home: 20 + Math.floor(r() * 40), draw: 6 + Math.floor(r() * 14), away: 20 + Math.floor(r() * 40) },
      sv: { '2-1': 8 + Math.floor(r() * 10), '1-1': 5 + Math.floor(r() * 8), '1-2': 6 + Math.floor(r() * 9), '2-2': 3 + Math.floor(r() * 6), '3-1': 2 + Math.floor(r() * 6) },
      scorers: [],
    };
    m.scorers = genScorers(players, m, i * 31 + 7);
    return m;
  });
  matches.push({ id: 'm9', date: '2026-10-03T19:30:00+07:00', home: 'f9', away: 'f8', hs: 0, as: 0, status: 'up', venue: DEFAULT_VENUE, votes: { home: 38, draw: 15, away: 42 }, sv: { '2-1': 12, '1-1': 8, '1-2': 10, '3-2': 6, '2-2': 5 }, scorers: [] });
  const transfers: Transfer[] = [
    { pid: 'p10', name: 'Lâm Chí Thanh', from: 'f9', to: 'f8', fee: 1.2, date: '2026-06-20' },
    { pid: 'p30', name: 'Võ Đình Khôi', from: 'f8', to: 'f9', fee: 0.8, date: '2026-08-01' },
  ];
  const offers = [
    { id: 'o1', pid: 'p28', from: 'f8', to: 'f9', price: 40, value: valOf(89), note: 'F8 cần một trung phong đẳng cấp cho trận derby tháng 10.', by: 'son.f8', status: 'pending' as const, date: '2026-09-20' },
    { id: 'o2', pid: 'p6', from: 'f9', to: 'f8', price: 30, value: valOf(87), note: '', by: 'vinh.f9', status: 'pending' as const, date: '2026-09-22' },
  ];
  return { teams, players, matches, transfers, offers };
}
