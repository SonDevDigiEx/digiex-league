import { useAccess, useLeague } from '../data/store';
import type { Match, Player } from '../lib/types';
import { FameAvatar } from './Fame';
import { participantsOf, RsvpAction } from './MatchPlayers';

/** Home: who has checked in for the next match, per side, with quick join / leave. */
export function RsvpBoard({ m }: { m: Match }) {
  const { snap, user, openCard } = useLeague();
  const { tm } = useAccess();
  const d = snap!;
  const rows = participantsOf(d.participants, m.id);
  const byId = new Map(d.players.map((p) => [p.id, p]));
  const sides = [tm(m.home), tm(m.away)].map((t) => {
    const list = rows.filter((r) => r.teamId === t.id).map((r) => byId.get(r.playerId)).filter(Boolean) as Player[];
    const squad = d.players.filter((p) => p.teamId === t.id).length;
    return { t, list, squad };
  });
  return (
    <div className="rb">
      <div className="rb-head">
        <div className="rb-k"><i />ĐIỂM DANH TRẬN TIẾP THEO</div>
        <div className="rb-total"><b>{rows.length}</b> người đã tham gia</div>
      </div>
      <div className="rb-sides">
        {sides.map(({ t, list, squad }) => (
          <div key={t.id} className="rb-side" style={{ ['--tc' as string]: t.color }}>
            <div className="rb-side-h">
              <span className="dot" style={{ background: t.color }} />{t.short}
              <b>{list.length}</b><small>/{squad} thành viên</small>
              <div className="rb-bar"><div style={{ width: Math.min(100, squad ? (list.length / squad) * 100 : 0) + '%' }} /></div>
            </div>
            <div className="rb-chips">
              {list.map((p) => {
                const me = !!user && p.userId === user.id;
                return (
                  <button key={p.id} className={'rb-chip' + (me ? ' me' : '') + (p.teamId !== t.id ? ' free' : '')} onClick={() => openCard(p.id)} title={p.name + (p.teamId !== t.id ? ' · tự do' : '')}>
                    <FameAvatar p={p} team={t} size={24} /><span>{p.name.split(' ').slice(-2).join(' ')}{me ? ' (bạn)' : ''}</span>
                  </button>
                );
              })}
              {!list.length && <span className="note">Chưa ai điểm danh.</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="rb-act"><RsvpAction m={m} /></div>
    </div>
  );
}
