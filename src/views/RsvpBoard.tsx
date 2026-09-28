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
  const busyRows = d.busy.filter((b) => b.matchId === m.id);
  const sides = [tm(m.home), tm(m.away)].map((t) => {
    const list = rows.filter((r) => r.teamId === t.id).map((r) => byId.get(r.playerId)).filter(Boolean) as Player[];
    const members = d.players.filter((p) => p.teamId === t.id);
    const busy = busyRows.filter((b) => b.teamId === t.id).map((b) => byId.get(b.playerId)).filter(Boolean) as Player[];
    const answered = new Set([...list, ...busy].map((p) => p.id));
    const silent = members.filter((p) => !answered.has(p.id));
    return { t, list, busy, silent, squad: members.length };
  });
  const chip = (p: Player, t: (typeof sides)[number]['t'], cls = '') => {
    const me = !!user && p.userId === user.id;
    return (
      <button key={p.id} className={'rb-chip' + (me ? ' me' : '') + (p.teamId !== t.id ? ' free' : '') + (cls ? ' ' + cls : '')} onClick={() => openCard(p.id)} title={p.name + (p.teamId !== t.id ? ' · tự do' : '')}>
        <FameAvatar p={p} team={t} size={24} /><span>{p.name.split(' ').slice(-2).join(' ')}{me ? ' (bạn)' : ''}</span>
      </button>
    );
  };
  return (
    <div className="rb">
      <div className="rb-head">
        <div className="rb-k"><i />ĐIỂM DANH TRẬN TIẾP THEO</div>
        <div className="rb-total"><b>{rows.length}</b> tham gia<span> · 😴 {busyRows.length} bận</span></div>
      </div>
      <div className="rb-sides">
        {sides.map(({ t, list, busy, silent, squad }) => (
          <div key={t.id} className="rb-side" style={{ ['--tc' as string]: t.color }}>
            <div className="rb-side-h">
              <span className="dot" style={{ background: t.color }} />{t.short}
              <b>{list.length}</b><small>/{squad} thành viên</small>
              <div className="rb-bar"><div style={{ width: Math.min(100, squad ? (list.length / squad) * 100 : 0) + '%' }} /></div>
            </div>
            <div className="rb-chips">
              {list.map((p) => chip(p, t))}
              {!list.length && <span className="note">Chưa ai điểm danh.</span>}
            </div>
            {busy.length > 0 && <div className="rb-sub"><span className="rb-lbl">😴 BẬN · {busy.length}</span><div className="rb-chips">{busy.map((p) => chip(p, t, 'busy'))}</div></div>}
            {silent.length > 0 && <div className="rb-sub"><span className="rb-lbl">⏳ CHƯA PHẢN HỒI · {silent.length}</span><div className="rb-chips">{silent.map((p) => chip(p, t, 'silent'))}</div></div>}
          </div>
        ))}
      </div>
      <div className="rb-act"><RsvpAction m={m} /></div>
    </div>
  );
}
