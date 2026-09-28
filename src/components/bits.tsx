import type { CSSProperties, ReactNode } from 'react';
import { CARD_SHINE, crestBg, crestTxt, ini, LBL, LBL_GK, money, tier } from '../lib/league';
import type { Player, Team } from '../lib/types';

export function Crest({ team, className, style, text = true }: { team: Team; className?: string; style?: CSSProperties; text?: boolean }) {
  return <div className={'crest ' + (className || '')} style={{ background: crestBg(team), ...style }}>{text ? crestTxt(team) : null}</div>;
}

export function SecTitle({ children, color, sm }: { children: ReactNode; color?: string; sm?: boolean }) {
  return (
    <div className={'sec-t' + (sm ? ' sm' : '')}>
      <i style={color ? { background: color } : undefined} />
      <h2>{children}</h2>
    </div>
  );
}

export function Lock({ title, desc, big, onLogin }: { title: string; desc: string; big?: boolean; onLogin: () => void }) {
  return (
    <div className={'lock' + (big ? ' big' : '')}>
      <div className="lock-ico"><b /><span /></div>
      <div className="lock-t">{title}</div>
      <div className="lock-d">{desc}</div>
      <button className="btn-lime lg" onClick={onLogin}>Đăng nhập</button>
    </div>
  );
}

/** Small OVR/POS shield used in lists (market rows, requests, forms). */
export function OvrBadge({ p, className, onClick }: { p: Pick<Player, 'ovr' | 'pos'>; className: string; onClick?: () => void }) {
  const t = tier(p.ovr);
  return (
    <button type="button" className={'badge ' + className} style={{ background: t.bg, color: t.fg }} onClick={onClick}>
      <b>{p.ovr}</b><span>{p.pos}</span>
    </button>
  );
}

/** FO4-style player card, 150×214. */
export function PlayerCard({ p, team, delay = 0, onClick, still }: { p: Player; team: Team; delay?: number; onClick?: () => void; still?: boolean }) {
  const t = tier(p.ovr);
  const L = p.pos === 'GK' ? LBL_GK : LBL;
  const last = p.name.split(' ').slice(-2).join(' ').toUpperCase();
  return (
    <button type="button" className={'pc t-' + t.label.toLowerCase() + (still ? ' static' : '')} style={{ animationDelay: delay.toFixed(2) + 's' }} onClick={onClick} aria-label={`${p.name} · ${p.ovr} ${p.pos}`}>
      <div className="pc-rim" style={{ background: t.rim }} />
      <div className="pc-in" style={{ background: t.bg, color: t.fg }}>
        <div className="pc-hatch" />
        {CARD_SHINE && p.ovr >= 85 && <div className="pc-shine" />}
        {p.ovr >= 90 && <div className="pc-spark" />}
        {p.ovr >= 95 && <div className="pc-holo" />}
        <div className="pc-side">
          <div className="pc-ovr">{p.ovr}</div>
          <div className="pc-pos">{p.pos}</div>
          <div className="pc-team" style={{ background: team.color }}>{team.short}</div>
          <div className="pc-num">#{p.num}</div>
        </div>
        {p.photo
          ? <img className="pc-photo" src={p.photo} alt="" />
          : <div className="pc-sil"><b /><span>{ini(p.name)}</span></div>}
        <div className="pc-name">{last}</div>
        <div className="pc-stats">
          {L.map((k, j) => <div key={k}><b>{p.stats[j]}</b><span>{k}</span></div>)}
        </div>
        <div className="pc-val">{money(p.value)}</div>
      </div>
    </button>
  );
}

/** ▲ +12% / ▼ −8% chip for market value changes. */
export function Trend({ pct }: { pct: number | null }) {
  if (pct == null || Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  return <span className={'trend ' + (up ? 'up' : 'down')}>{up ? '▲' : '▼'} {up ? '+' : '−'}{Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%</span>;
}

/** Tiny line chart of a player's value over the last weeks. */
export function Sparkline({ points, w = 220, h = 46 }: { points: number[]; w?: number; h?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const xy = points.map((v, i) => [(i / (points.length - 1)) * (w - 4) + 2, h - 4 - ((v - min) / span) * (h - 8)]);
  const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const up = points[points.length - 1] >= points[0];
  const c = up ? '#4ade80' : '#ff6b81';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Lịch sử giá trị">
      <path d={d + ` L ${xy[xy.length - 1][0]} ${h} L ${xy[0][0]} ${h} Z`} fill={c} opacity=".12" />
      <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="3" fill={c} />
    </svg>
  );
}
