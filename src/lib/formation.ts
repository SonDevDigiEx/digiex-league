// Formation templates for S5 / S7 and helpers to place players on the pitch.
// Coordinates are % of a vertical pitch for ONE team: own goal at the bottom (y = 100).
import { GROUP } from './league';
import type { Group, Player } from './types';

export type Format = 's5' | 's7';
export interface Slot { pid: string | null; x: number; y: number }
export interface Lineup { teamId: string; format: Format; formation: string; slots: Slot[] }

export const FORMAT_LABEL: Record<Format, string> = { s5: 'Sân 5', s7: 'Sân 7' };
export const FORMATIONS: Record<Format, string[]> = {
  s7: ['2-3-1', '3-2-1', '2-1-2-1', '3-1-2', '2-2-2'],
  s5: ['2-1-1', '1-2-1', '2-2', '1-1-2', '3-1'],
};
export const SIZE: Record<Format, number> = { s5: 5, s7: 7 };

const GK_Y = 90, BACK_Y = 72, FRONT_Y = 22;

/** Role of each template slot: GK, then outfield rows back to front (first row DEF, last FWD, others MID). */
export function templateRoles(formation: string): Group[] {
  const rows = formation.split('-').map(Number);
  return ['GK', ...rows.flatMap((n, i) => Array<Group>(n).fill(rows.length === 1 ? 'MID' : i === 0 ? 'DEF' : i === rows.length - 1 ? 'FWD' : 'MID'))];
}

/** Slot positions for a template (GK first, then rows back to front, left to right). */
export function templatePoints(formation: string): { x: number; y: number }[] {
  const rows = formation.split('-').map(Number);
  const pts = [{ x: 50, y: GK_Y }];
  rows.forEach((n, r) => {
    const y = rows.length === 1 ? 50 : BACK_Y - (r * (BACK_Y - FRONT_Y)) / (rows.length - 1);
    for (let i = 0; i < n; i++) pts.push({ x: Math.round(50 + ((i + 1) / (n + 1) - 0.5) * 92), y: Math.round(y) });
  });
  return pts;
}

const plays = (p: Player, g: Group) => p.positions.some((x) => GROUP[x] === g);
/** How well a player fits a role: 2 = primary position, 1 = one of their positions, 0 = no. */
export const fit = (p: Player, g: Group) => (GROUP[p.pos] === g ? 2 : plays(p, g) ? 1 : 0);

/** Best available player for every slot (primary position first, then any listed position, then anyone). */
export function autoFill(formation: string, squad: Player[]): Slot[] {
  const roles = templateRoles(formation);
  const pts = templatePoints(formation);
  const used = new Set<string>();
  const pick = (g: Group, minFit: number) => {
    const p = squad.filter((x) => !used.has(x.id) && fit(x, g) >= minFit && (g === 'GK' || minFit > 0 || x.pos !== 'GK'))
      .sort((a, b) => fit(b, g) - fit(a, g) || b.ovr - a.ovr)[0];
    if (p) used.add(p.id);
    return p?.id ?? null;
  };
  const out: (string | null)[] = roles.map(() => null);
  for (const minFit of [2, 1, 0]) roles.forEach((g, i) => { if (!out[i]) out[i] = pick(g, minFit); });
  return pts.map((pt, i) => ({ ...pt, pid: out[i] }));
}

/** Re-arrange the players already on the pitch into a template's shape (same player set, better roles). */
export function applyTemplate(formation: string, current: Slot[], squad: Player[]): Slot[] {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const onPitch = current.map((s) => (s.pid ? byId.get(s.pid) : undefined)).filter(Boolean) as Player[];
  const roles = templateRoles(formation);
  const pts = templatePoints(formation);
  const out: (string | null)[] = roles.map(() => null);
  const used = new Set<string>();
  for (const minFit of [2, 1, 0]) {
    roles.forEach((g, i) => {
      if (out[i]) return;
      const p = onPitch.filter((x) => !used.has(x.id) && fit(x, g) >= minFit && (g === 'GK' || minFit > 0 || x.pos !== 'GK'))
        .sort((a, b) => fit(b, g) - fit(a, g) || b.ovr - a.ovr)[0];
      if (p) { out[i] = p.id; used.add(p.id); }
    });
  }
  // Anyone left over (e.g. a second GK) takes the remaining empty slots.
  onPitch.filter((p) => !used.has(p.id)).forEach((p) => { const i = out.indexOf(null); if (i >= 0) out[i] = p.id; });
  return pts.map((pt, i) => ({ ...pt, pid: out[i] }));
}

/** Players who are still in the team (a saved lineup may mention someone who has left). */
export function liveSlots(l: Lineup, squad: Player[]): Slot[] {
  const ids = new Set(squad.map((p) => p.id));
  return l.slots.map((s) => ({ ...s, pid: s.pid && ids.has(s.pid) ? s.pid : null }));
}

/** Role implied by where a slot stands on the pitch (for the "suggested" list). */
export function roleAt(y: number): Group {
  return y >= 84 ? 'GK' : y >= 60 ? 'DEF' : y >= 36 ? 'MID' : 'FWD';
}
