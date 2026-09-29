import type { Group, Match, Player, Pos, Role, Team } from './types';

export const GROUP: Record<Pos, Group> = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD' };
export const GNAME: Record<Group, string> = { GK: 'THỦ MÔN', DEF: 'HẬU VỆ', MID: 'TIỀN VỆ', FWD: 'TIỀN ĐẠO' };
export const GORD: Record<Group, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
export const LBL = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
export const LBL_GK = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'];
export const POSS: Pos[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
export const SWATCHES: [string, string][] = [['#ff3b5c', '#7a0f24'], ['#2f8cff', '#0b2a66'], ['#a855f7', '#3b0f6b'], ['#14d3b8', '#05524a'], ['#ff8a1f', '#6b3100'], ['#f5c542', '#7a5a06']];
export const ROLE_LABEL: Record<Role, string> = { admin: 'Ban tổ chức', chair: 'Chủ tịch', coach: 'Ban huấn luyện', member: 'Thành viên', pending: 'Chờ duyệt' };
/** Pseudo-team shown for players without a club. */
export const FREE_AGENT: Team = {
  id: '', name: 'Tự do', short: 'TD', color: '#6b7280', color2: '#2b303b', motto: '', founded: 0,
  chair: { name: '—', since: '', quote: '' }, coach: { name: '—' }, logo: null,
};
export const DEFAULT_VENUE = 'Sân bóng Hoàng Mai · Sân số 3';

/** 7-a-side formation used for auto-picked lineups (DEF-MID-FWD). */
export const FORMATION = '2-3-1';
/** Animated shine on ELITE/ICON cards. */
export const CARD_SHINE = true;

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export const rng = (s: number) => () => (s = (s * 9301 + 49297) % 233280) / 233280;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const pad = (n: number) => String(n).padStart(2, '0');
export const hexA = (h: string, a: number) => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
/** Market value (tỷ) derived from OVR. Mirrored by public.player_value() in SQL. */
export const valOf = (o: number) => Math.round(Math.pow(1.15, o - 60) * 8) / 10;
export const ini = (n: string) => {
  const w = n.trim().split(/\s+/);
  return ((w.length > 1 ? w[w.length - 2][0] : '') + w[w.length - 1][0]).toUpperCase();
};
/** Lowest jersey number (1–999) nobody uses; 0 if all are taken. */
export const nextFreeNum = (players: { num: number }[]) => {
  const used = new Set(players.map((p) => p.num));
  for (let n = 1; n <= 999; n++) if (!used.has(n)) return n;
  return 0;
};
/** % change vs about a week ago (latest history point ≥7 days old, else the oldest one); null if no history yet. */
export function valueTrend(history: { day: string; value: number }[] | undefined, current: number): number | null {
  if (!history?.length) return null;
  const cut = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const old = [...history].reverse().find((h) => h.day <= cut) ?? history.find((h) => h.day < today);
  if (!old || !old.value) return null;
  return Math.round((current / old.value - 1) * 1000) / 10;
}
/** Lowercase, accent-free text for search ("Vĩnh" matches "vinh"). */
export const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
export const money = (v: number) => (+v).toFixed(1) + ' tỷ';
export const todayStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};
export const fDate = (iso: string) => {
  const t = new Date(iso);
  return `${WD[t.getDay()]}, ${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()}`;
};
export const fTime = (iso: string) => {
  const t = new Date(iso);
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
};
export const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

/** Stat weights per primary position (PAC SHO PAS DRI DEF PHY; GK: DIV HAN KIC REF SPD POS). Mirrors public.compute_ovr(). */
export const POS_WEIGHTS: Record<Pos, number[]> = {
  ST: [.25, .35, .08, .17, 0, .15], LW: [.30, .22, .15, .25, 0, .08], RW: [.30, .22, .15, .25, 0, .08],
  CAM: [.12, .20, .30, .30, 0, .08], CM: [.10, .10, .35, .20, .12, .13], CDM: [.08, .03, .25, .10, .32, .22],
  LB: [.28, 0, .17, .13, .27, .15], RB: [.28, 0, .17, .13, .27, .15], CB: [.12, 0, .10, .05, .45, .28],
  GK: [.23, .22, .08, .27, .05, .15],
};
/** OVR from the primary position and the six stats (server computes the same; the UI only previews). */
export const ovrOf = (pos: Pos, stats: number[]) =>
  clamp(Math.round(POS_WEIGHTS[pos].reduce((a, w, i) => a + w * (stats[i] ?? 0), 0)), 40, 99);

export function genStats(pos: Pos, ovr: number, seed: number) {
  const r = rng(seed);
  const off = { GK: [2, 0, -12, 3, -28, -1], DEF: [-6, -28, -8, -10, 6, 4], MID: [-3, -4, 4, 3, -14, -5], FWD: [3, 4, -6, 2, -45, -6] }[GROUP[pos]];
  return off.map((o) => clamp(Math.round(ovr + o + (r() * 8 - 4)), 20, 99));
}

export interface Tier { bg: string; fg: string; rim: string; label: string; glow: string }
export function tier(o: number): Tier {
  if (o >= 95) return { bg: 'linear-gradient(160deg,#1a0f2e 0%,#3b1a6b 35%,#0f2a4a 70%,#08121f 100%)', fg: '#fff6d6', rim: '#ffe58a', label: 'LEGEND', glow: 'rgba(190,140,255,.55)' };
  if (o >= 90) return { bg: 'linear-gradient(160deg,#fff8dc 0%,#f0cf73 40%,#9c7424 100%)', fg: '#2a1c00', rim: '#fff1b8', label: 'ICON', glow: 'rgba(255,215,110,.5)' };
  if (o >= 85) return { bg: 'linear-gradient(160deg,#2a4fd6 0%,#0d1a52 55%,#060b26 100%)', fg: '#ffe39a', rim: '#d9b54a', label: 'ELITE', glow: 'rgba(80,130,255,.5)' };
  if (o >= 78) return { bg: 'linear-gradient(160deg,#fbe08a 0%,#d4a534 50%,#7a5510 100%)', fg: '#2b1c00', rim: '#ffeaa0', label: 'GOLD', glow: 'rgba(240,190,60,.42)' };
  if (o >= 70) return { bg: 'linear-gradient(160deg,#f2f5f9 0%,#aab4c2 50%,#5b6573 100%)', fg: '#10151c', rim: '#ffffff', label: 'SILVER', glow: 'rgba(200,210,225,.32)' };
  return { bg: 'linear-gradient(160deg,#f0b683 0%,#b0652f 50%,#56290f 100%)', fg: '#200d00', rim: '#ffd2a8', label: 'BRONZE', glow: 'rgba(220,130,70,.32)' };
}

export const crestBg = (t: Team) =>
  // A custom logo is shown as-is (its own shape, no shield / gradient); otherwise the default coloured shield.
  t.logo ? `center/contain no-repeat url("${t.logo}")` : `linear-gradient(160deg,${t.color},${t.color2})`;
export const crestTxt = (t: Team) => (t.logo ? '' : t.short);

export interface FormChip { l: string; bg: string }
export interface Record_ { w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; p: number; form: FormChip[] }

/** Season record for a team over finished matches (sorted by date asc). */
export function record(done: Match[], tid: string): Record_ {
  let w = 0, dr = 0, l = 0, gf = 0, ga = 0;
  const form: string[] = [];
  done.forEach((m) => {
    if (m.home !== tid && m.away !== tid) return;
    const my = m.home === tid ? m.hs : m.as, op = m.home === tid ? m.as : m.hs;
    gf += my; ga += op;
    const r = my > op ? 'W' : my < op ? 'L' : 'D';
    if (r === 'W') w++; else if (r === 'L') l++; else dr++;
    form.unshift(r);
  });
  return {
    w, d: dr, l, gf, ga, gd: gf - ga, pts: w * 3 + dr, p: w + dr + l,
    form: form.slice(0, 5).map((x) => ({ l: x === 'W' ? 'T' : x === 'L' ? 'B' : 'H', bg: x === 'W' ? '#1fa65c' : x === 'L' ? '#d63a48' : '#5b6373' })),
  };
}

export function sortedMatches(ms: Match[]) {
  const all = ms.slice().sort((a, b) => a.date.localeCompare(b.date));
  return {
    all,
    done: all.filter((m) => m.status === 'done'),
    ups: all.filter((m) => m.status === 'up'),
    /** Finished and cancelled, oldest first. */
    history: all.filter((m) => m.status !== 'up'),
  };
}

/** Auto-pick a lineup: best players per line, filling gaps with anyone left (GK only in goal). */
export function lineup(squad: Player[], formation = FORMATION) {
  const sq = squad.slice().sort((a, b) => b.ovr - a.ovr), used = new Set<string>();
  const take = (g: Group, n: number) => {
    const o: Player[] = [];
    for (const p of sq) {
      if (o.length >= n) break;
      if (!used.has(p.id) && GROUP[p.pos] === g) { o.push(p); used.add(p.id); }
    }
    return o;
  };
  const c = formation.split('-').map(Number);
  const rows = [take('GK', 1), take('DEF', c[0]), take('MID', c[1]), take('FWD', c[2])];
  const need = [1, ...c];
  rows.forEach((row, i) => {
    while (row.length < need[i]) {
      const p = sq.find((p) => !used.has(p.id) && (i === 0 || p.pos !== 'GK')) || sq.find((p) => !used.has(p.id));
      if (!p) break;
      row.push(p); used.add(p.id);
    }
  });
  return { rows, bench: sq.filter((p) => !used.has(p.id)) };
}

/** Load an image file, downscale so its longest side is <= size, and re-encode. */
/**
 * Downscale an image file. `type: 'photo'` picks the format from the content: JPEG for opaque photos,
 * WebP (PNG where the browser can't encode WebP) when the image has transparency, so a cut-out
 * player photo keeps its transparent background instead of turning black.
 */
export function readImg(file: File, size: number, type: string): Promise<Blob> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sc = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      encodeCanvas(c, type).then(res, rej);
    };
    img.src = url;
  });
}

/** Encode a canvas; `'photo'` = JPEG when opaque, WebP/PNG when it has transparency. */
export function encodeCanvas(c: HTMLCanvasElement, type: string): Promise<Blob> {
  let out = type;
  if (type === 'photo') {
    const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let alpha = false;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
    out = alpha ? 'image/webp' : 'image/jpeg';
  }
  return new Promise((res, rej) => c.toBlob((b) => {
    if (!b) return rej(new Error('encode failed'));
    // Browsers without a WebP encoder return PNG, which also keeps transparency.
    if (out === 'image/webp' && b.type !== 'image/webp') return c.toBlob((p) => (p ? res(p) : rej(new Error('encode failed'))), 'image/png');
    res(b);
  }, out, out === 'image/png' ? undefined : 0.88));
}

/** File extension for an uploaded image blob. */
export const extOf = (b: Blob) => (b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : 'jpg');

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); });
