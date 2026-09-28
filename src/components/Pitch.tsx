// Pitch drawing + player tokens shared by the lineup builder, the home page and the match view.
import type { CSSProperties, ReactNode } from 'react';
import { useLeague } from '../data/store';
import { ini } from '../lib/league';
import type { Player, Team } from '../lib/types';

export function Pitch({ children, className = '', style, innerRef, half }: {
  children?: ReactNode; className?: string; style?: CSSProperties; innerRef?: React.Ref<HTMLDivElement>; half?: boolean;
}) {
  return (
    <div className={'pitch ' + className} style={style} ref={innerRef}>
      {half
        ? <><i className="box-b" /><i className="six-b" /><i className="arc-b" /></>
        : <><i className="mid" /><i className="circ" /><i className="box-t" /><i className="box-b" /><i className="six-t" /><i className="six-b" /></>}
      {children}
    </div>
  );
}

/** Photo (or the account's Google avatar) of a player, if any. */
export function usePhoto() {
  const { snap } = useLeague();
  return (p: Player) => p.photo || (p.userId ? snap?.members.find((m) => m.id === p.userId)?.avatar : null) || null;
}

/** A player (or an empty slot) standing on the pitch. */
export function Token({ p, team, x, y, delay = 0, selected, empty, onClick, onPointerDown, dragging }: {
  p?: Player | null; team: Team; x: number; y: number; delay?: number; selected?: boolean; empty?: boolean;
  onClick?: () => void; onPointerDown?: (e: React.PointerEvent) => void; dragging?: boolean;
}) {
  const photo = usePhoto();
  const src = p ? photo(p) : null;
  return (
    <button type="button" className={'ltok' + (selected ? ' sel' : '') + (empty || !p ? ' empty' : '') + (dragging ? ' drag' : '')}
      style={{ left: x + '%', top: y + '%', ['--tc' as string]: team.color }} onClick={onClick} onPointerDown={onPointerDown}
      aria-label={p ? p.name : 'Vị trí trống'}>
      <span className="ltok-in" style={{ animationDelay: delay + 's' }}>
        <span className="ltok-av" style={src ? { backgroundImage: `url("${src}")` } : undefined}>
          {p ? (src ? '' : ini(p.name)) : <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>}
        </span>
        {p && <span className="ltok-ovr">{p.ovr}</span>}
        <span className="ltok-name">{p ? p.name.split(' ').pop() : 'Trống'}</span>
      </span>
    </button>
  );
}
