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
    <button type="button" className={'pc' + (still ? ' static' : '')} style={{ animationDelay: delay.toFixed(2) + 's' }} onClick={onClick} aria-label={`${p.name} · ${p.ovr} ${p.pos}`}>
      <div className="pc-rim" style={{ background: t.rim }} />
      <div className="pc-in" style={{ background: t.bg, color: t.fg }}>
        <div className="pc-hatch" />
        {CARD_SHINE && p.ovr >= 85 && <div className="pc-shine" />}
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
