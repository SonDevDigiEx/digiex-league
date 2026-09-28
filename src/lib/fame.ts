// Hall of fame: top scorers and Man-of-the-Match leaders per month / quarter / year.
import type { Match, Participation } from './types';

export type PeriodKind = 'month' | 'quarter' | 'year' | 'all';
export interface Period { kind: PeriodKind; year: number; /** month 1–12 or quarter 1–4 */ n: number }

export const currentPeriod = (kind: PeriodKind, d = new Date()): Period => ({
  kind, year: d.getFullYear(), n: kind === 'month' ? d.getMonth() + 1 : kind === 'quarter' ? Math.floor(d.getMonth() / 3) + 1 : 0,
});

export function shiftPeriod(p: Period, by: number): Period {
  if (p.kind === 'year') return { ...p, year: p.year + by };
  if (p.kind === 'all') return p;
  const per = p.kind === 'month' ? 12 : 4;
  const idx = p.year * per + (p.n - 1) + by;
  return { ...p, year: Math.floor(idx / per), n: (idx % per) + 1 };
}

export const periodKey = (p: Period) => `${p.kind}-${p.year}-${p.n}`;
export const periodLabel = (p: Period) =>
  p.kind === 'month' ? `Tháng ${p.n}/${p.year}` : p.kind === 'quarter' ? `Quý ${['I', 'II', 'III', 'IV'][p.n - 1]} · ${p.year}` : p.kind === 'year' ? `Năm ${p.year}` : 'Mọi thời đại';

export function inPeriod(iso: string, p: Period) {
  if (p.kind === 'all') return true;
  const d = new Date(iso);
  if (d.getFullYear() !== p.year) return false;
  if (p.kind === 'month') return d.getMonth() + 1 === p.n;
  if (p.kind === 'quarter') return Math.floor(d.getMonth() / 3) + 1 === p.n;
  return true;
}

export interface Leader { playerId: string; value: number; matches: number }

/**
 * Goals per player per finished match: the larger of the admin's scorer list and the player's
 * BHL-approved self-report, so a goal recorded in both places is counted once.
 */
export function topScorers(matches: Match[], parts: Participation[], p: Period): Leader[] {
  const done = matches.filter((m) => m.status === 'done' && inPeriod(m.date, p));
  const ids = new Set(done.map((m) => m.id));
  const perMatch = new Map<string, Map<string, number>>();
  const bump = (mid: string, pid: string, v: number) => {
    const row = perMatch.get(mid) ?? new Map<string, number>();
    row.set(pid, Math.max(row.get(pid) ?? 0, v));
    perMatch.set(mid, row);
  };
  done.forEach((m) => {
    const c = new Map<string, number>();
    (m.scorers || []).forEach((g) => c.set(g.pid, (c.get(g.pid) ?? 0) + 1));
    c.forEach((v, pid) => bump(m.id, pid, v));
  });
  parts.filter((x) => x.status === 'approved' && ids.has(x.matchId) && (x.goals ?? 0) > 0).forEach((x) => bump(x.matchId, x.playerId, x.goals!));
  const tot = new Map<string, Leader>();
  perMatch.forEach((row) => row.forEach((v, pid) => {
    if (!v) return;
    const l = tot.get(pid) ?? { playerId: pid, value: 0, matches: 0 };
    l.value += v; l.matches += 1;
    tot.set(pid, l);
  }));
  return [...tot.values()].sort((a, b) => b.value - a.value || a.matches - b.matches);
}

/** Number of Man-of-the-Match awards per player. */
export function topMom(matches: Match[], p: Period): Leader[] {
  const tot = new Map<string, Leader>();
  matches.filter((m) => m.status === 'done' && m.mom && inPeriod(m.date, p)).forEach((m) => {
    const l = tot.get(m.mom!) ?? { playerId: m.mom!, value: 0, matches: 0 };
    l.value += 1; l.matches += 1;
    tot.set(m.mom!, l);
  });
  return [...tot.values()].sort((a, b) => b.value - a.value);
}

/** Competition ranking: equal values share a rank (1, 1, 3…). */
export function ranks(list: Leader[]) {
  const out: number[] = [];
  list.forEach((l, i) => out.push(i && list[i - 1].value === l.value ? out[i - 1] : i + 1));
  return out;
}
