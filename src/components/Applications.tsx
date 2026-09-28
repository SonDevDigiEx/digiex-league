// Free agents apply to join a team; the team's chairman (or an admin) decides.
import { OvrBadge, SecTitle } from './bits';
import { api, useAccess, useLeague } from '../data/store';
import { Spin, useAction } from '../data/useAction';
import { dmy } from '../lib/league';
import type { Application } from '../lib/types';

const MAX_PENDING = 3;

/** The signed-in free agent's applications (and whether they may apply at all). */
export function useMyApplications() {
  const { snap } = useLeague();
  const { myPlayer, isStaffPlayer } = useAccess();
  const free = !!myPlayer && !myPlayer.teamId && !isStaffPlayer(myPlayer);
  const mine = myPlayer && snap ? snap.applications.filter((a) => a.playerId === myPlayer.id) : [];
  const pending = mine.filter((a) => a.status === 'pending');
  return { free, mine, pending, full: pending.length >= MAX_PENDING };
}

/** Team page: "Ứng tuyển vào đội" for free agents, or the pending state with "Rút đơn". */
export function ApplyButton({ teamId }: { teamId: string }) {
  const { openModal } = useLeague();
  const { free, pending, full } = useMyApplications();
  const { act, pending: busyKey, busy } = useAction(1500);
  if (!free) return null;
  const mine = pending.find((a) => a.teamId === teamId);
  if (mine) {
    return (
      <div className="apply-state">
        <span>⏳ Đã ứng tuyển · chờ Chủ tịch duyệt</span>
        <button className="btn-upload" disabled={busy} onClick={() => act('cancel', () => api.cancelApplication(mine.id), 'Đã rút đơn ứng tuyển')}>{busyKey ? <Spin /> : 'Rút đơn'}</button>
      </div>
    );
  }
  return (
    <button className="btn-apply" disabled={full} title={full ? `Tối đa ${MAX_PENDING} đơn chờ duyệt cùng lúc` : undefined} onClick={() => openModal({ kind: 'apply', teamId })}>
      ✋ Ứng tuyển vào đội
    </button>
  );
}

const ST: Record<Application['status'], [string, string, string]> = {
  pending: ['CHỜ DUYỆT', 'rgba(245,197,66,.15)', '#f5c542'],
  accepted: ['ĐÃ NHẬN', 'rgba(198,255,61,.15)', '#c6ff3d'],
  rejected: ['TỪ CHỐI', 'rgba(229,72,77,.15)', '#ff6b81'],
  cancelled: ['ĐÃ HỦY', 'rgba(255,255,255,.07)', '#8b93a7'],
};

/** Profile modal: the free agent's own applications. */
export function MyApplications() {
  const { go, closeModal } = useLeague();
  const { tm } = useAccess();
  const { free, mine } = useMyApplications();
  const { act, busy } = useAction(1500);
  if (!free && !mine.length) return null;
  return (
    <div className="stat-box">
      <div className="stat-box-h"><span>ỨNG TUYỂN VÀO ĐỘI</span>{free && <span style={{ letterSpacing: 0 }}>tối đa {MAX_PENDING} đơn chờ</span>}</div>
      {free && !mine.some((a) => a.status === 'pending') && <div className="note">Bạn đang là cầu thủ tự do. Vào trang đội bóng và bấm <b>“Ứng tuyển vào đội”</b> — Chủ tịch đội sẽ duyệt.</div>}
      {mine.slice(0, 6).map((a) => (
        <div key={a.id} className="app-mine">
          <span className="dot" style={{ background: tm(a.teamId).color }} />
          <a onClick={() => { closeModal(); go({ view: 'teams', teamId: a.teamId }); }}>{tm(a.teamId).name}</a>
          <span className="note">{dmy(a.date.slice(0, 10))}</span>
          <span className="st" style={{ background: ST[a.status][1], color: ST[a.status][2] }}>{ST[a.status][0]}</span>
          {a.status === 'pending' && <button type="button" className="btn-cancel" disabled={busy} onClick={() => act('c' + a.id, () => api.cancelApplication(a.id), 'Đã rút đơn')}>Rút</button>}
        </div>
      ))}
    </div>
  );
}

/** Chairman (own team) / admin (all teams): pending applications with accept / reject. */
export function ApplicationsBox({ teamId }: { teamId?: string }) {
  const { snap, openCard } = useLeague();
  const { tm, isAdmin, myT } = useAccess();
  const { act, pending, busy } = useAction();
  const d = snap!;
  const teams = teamId ? [teamId] : isAdmin ? d.teams.map((t) => t.id) : myT ? [myT] : [];
  const canDecide = (tid: string) => isAdmin || myT === tid;
  const list = d.applications.filter((a) => a.status === 'pending' && teams.includes(a.teamId) && canDecide(a.teamId));
  if (!list.length) return null;
  return (
    <div className="rq apps">
      <div className="row-sb">
        <SecTitle sm color="#c6ff3d">Đơn ứng tuyển</SecTitle>
        <span className="rq-pend">{list.length} chờ duyệt</span>
      </div>
      {list.map((a, i) => {
        const p = d.players.find((x) => x.id === a.playerId);
        if (!p) return null;
        return (
          <div key={a.id} className="rq-item pend" style={{ animationDelay: (i * 0.05).toFixed(2) + 's' }}>
            <div className="rq-head">
              <OvrBadge p={p} className="rq-badge" onClick={() => openCard(p.id)} />
              <div className="rq-who">
                <span>{p.name}</span>
                <div className="flow"><span style={{ background: '#394052' }}>TỰ DO</span>→<span style={{ background: tm(a.teamId).color }}>{tm(a.teamId).short}</span></div>
              </div>
              <span className="note">{dmy(a.date.slice(0, 10))}</span>
            </div>
            <div className="note">{p.positions.join(' / ')} · OVR {p.ovr} · {p.age} tuổi</div>
            {a.message && <div className="quote">“{a.message}”</div>}
            <div className="acts">
              <button className="btn-ok" disabled={busy} onClick={() => act('y' + a.id, () => api.respondApplication(a.id, true), (m) => m as string)}>{pending === 'y' + a.id ? <Spin /> : 'Nhận vào đội'}</button>
              <button className="btn-no" disabled={busy} onClick={() => act('n' + a.id, () => api.respondApplication(a.id, false), (m) => m as string)}>{pending === 'n' + a.id ? <Spin /> : 'Từ chối'}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
