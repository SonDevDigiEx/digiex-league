import { useState } from 'react';
import { Crest, SecTitle } from '../components/bits';
import { api, squadOf, useAccess, useLeague } from '../data/store';
import { GORD, GROUP, hexA, ini, money, ROLE_LABEL, tier } from '../lib/league';
import type { Role } from '../lib/types';
import { useLogoUpload } from './Teams';

const MEMBERS = 'members';

export function Manage({ teamId }: { teamId?: string }) {
  const { snap, user, go, openModal, run } = useLeague();
  const { canTeam, canAny, isAdmin, canRelease, isStaffPlayer } = useAccess();
  const onLogo = useLogoUpload();
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  if (!user || !canAny) return <div className="view"><div className="empty">Bạn không có quyền quản lý đội.</div></div>;
  const d = snap!;
  const mTeams = d.teams.filter((t) => canTeam(t.id));
  const showMembers = isAdmin && (teamId === MEMBERS || !mTeams.length);
  const mt = mTeams.find((t) => t.id === (teamId || user.team)) || mTeams[0];
  const tabs = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {mTeams.map((t) => (
        <button key={t.id} className="pill" style={!showMembers && t.id === mt?.id ? { background: hexA(t.color, 0.22), color: '#fff' } : undefined}
          onClick={() => { setPendingDel(null); go({ view: 'manage', teamId: t.id }); }}>
          <span className="dot" style={{ background: t.color, border: 0 }} />{t.name}
        </button>
      ))}
      {isAdmin && <button className="pill" style={showMembers ? { background: 'rgba(198,255,61,.18)', color: '#fff' } : undefined} onClick={() => go({ view: 'manage', teamId: MEMBERS })}>
        <span className="dot" style={{ background: '#c6ff3d', border: 0 }} />Thành viên · {d.members.filter((m) => m.role !== 'pending').length}{d.members.some((m) => m.role === 'pending') ? ` (+${d.members.filter((m) => m.role === 'pending').length} chờ)` : ''}
      </button>}
      {isAdmin && <button className="pill add" onClick={() => openModal({ kind: 'addTeam' })}>+ Thêm đội</button>}
    </div>
  );
  const header = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h1 className="h1">Quản lý {showMembers ? 'thành viên' : 'đội'}</h1>
      <div className="lead">Quyền của bạn: <span style={{ color: '#c6ff3d', fontWeight: 600 }}>{ROLE_LABEL[user.role] + (user.team ? ' · ' + (d.teams.find((t) => t.id === user.team)?.short || '') : '')}</span> · {showMembers ? 'phân quyền Chủ tịch, BHL và Ban tổ chức.' : 'thêm, chỉnh sửa, xóa cầu thủ và cập nhật thông tin đội.'}</div>
    </div>
  );
  if (showMembers) return <div className="view g20">{header}{tabs}<Members /></div>;
  if (!mt) return <div className="view"><div className="empty">Chưa có đội nào.</div></div>;
  const rows = squadOf(d.players, mt.id).sort((a, b) => GORD[GROUP[a.pos]] - GORD[GROUP[b.pos]] || b.ovr - a.ovr);

  return (
    <div className="view g20">
      {header}
      {tabs}
      <section className="mg-team">
        <Crest team={mt} key={mt.id} />
        <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="mg-team-n">{mt.name}</div>
          <div className="lead" style={{ fontSize: 13 }}>Chủ tịch: <span style={{ color: '#fff' }}>{mt.chair.name}</span> · BHL: <span style={{ color: '#fff' }}>{mt.coach.name || '—'}</span></div>
        </div>
        <div className="mg-acts">
          <button className="up" onClick={() => openModal({ kind: 'editTeam', teamId: mt.id })}>Sửa thông tin</button>
          {user.role === 'chair' && user.team === mt.id && <button className="up grey" onClick={() => openModal({ kind: 'handover', teamId: mt.id })}>Bàn giao Chủ tịch</button>}
          <label className="up">Tải logo<input type="file" accept="image/*" onChange={onLogo(mt.id)} /></label>
          {mt.logo && <button className="up grey" onClick={() => run(() => api.setTeamLogo(mt.id, null), 'Đã gỡ logo')}>Gỡ logo</button>}
        </div>
      </section>
      <div className="row-sb wrap">
        <SecTitle>Danh sách cầu thủ · {rows.length}</SecTitle>
        <button className="btn-lime" onClick={() => openModal({ kind: 'player', teamId: mt.id })}>+ Thêm cầu thủ</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((p, i) => {
          const t = tier(p.ovr);
          const confirm = pendingDel === p.id;
          return (
            <div key={p.id} className="mg-row" style={{ animationDelay: Math.min(i * 0.03, 0.5).toFixed(2) + 's' }}>
              <div className="mg-ph" style={{ background: p.photo ? `center/cover url("${p.photo}")` : 'rgba(255,255,255,.05)' }}>{p.photo ? '' : ini(p.name)}</div>
              <div className="mg-info">
                <div><b style={{ background: t.bg, color: t.fg }}>{p.ovr}</b><span>{p.name}</span></div>
                <div>{p.pos} · #{p.num} · {p.age} tuổi · <span style={{ color: '#f5c542' }}>{money(p.value)}</span></div>
              </div>
              <div className="mg-btns">
                <button className="btn-ghost" onClick={() => openModal({ kind: 'player', playerId: p.id, teamId: p.teamId })}>Sửa</button>
                {canRelease(p.teamId) && !isStaffPlayer(p) && (
                  <button className={'btn-danger' + (pendingDel === 'rel:' + p.id ? ' on' : '')} style={{ borderColor: 'rgba(255,255,255,.2)' }} onClick={() => {
                    if (pendingDel !== 'rel:' + p.id) return setPendingDel('rel:' + p.id);
                    setPendingDel(null);
                    run(() => api.releasePlayer(p.id), `${p.name} đã thành cầu thủ tự do`);
                  }}>{pendingDel === 'rel:' + p.id ? 'Xác nhận giải phóng' : 'Giải phóng'}</button>
                )}
                <button className={'btn-danger' + (confirm ? ' on' : '')} onClick={() => {
                  if (!confirm) return setPendingDel(p.id);
                  setPendingDel(null);
                  run(() => api.deletePlayer(p.id), 'Đã xóa ' + p.name);
                }}>{confirm ? 'Xác nhận xóa' : 'Xóa'}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Admin: everyone who has signed in, with role + team assignment. */
function Members() {
  const { snap, user, run, openModal, openCard } = useLeague();
  const [q, setQ] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const d = snap!;
  const needle = q.trim().toLowerCase();
  const order: Record<Role, number> = { pending: -1, admin: 0, chair: 1, coach: 2, member: 3 };
  const pending = d.members.filter((m) => m.role === 'pending').sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const list = d.members.filter((m) => m.role !== 'pending')
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name, 'vi'));
  const save = (id: string, role: Role, team: string | null, name: string) => {
    if ((role === 'chair' || role === 'coach') && !team) team = d.teams[0]?.id ?? null;
    run(() => api.setMember(id, role, role === 'chair' || role === 'coach' ? team : null), `Đã cập nhật quyền cho ${name}`);
  };
  return (
    <>
      <div className="note" style={{ fontSize: 13 }}>
        Người đăng nhập lần đầu bằng Google công ty sẽ vào mục Chờ duyệt (chỉ được xem). Duyệt = nhập vị trí, chỉ số để họ trở thành cầu thủ (tự do hoặc vào đội); từ chối sẽ xóa tài khoản. Mỗi đội có một Chủ tịch — chỉ định Chủ tịch mới sẽ đưa Chủ tịch cũ về Thành viên.
      </div>
      {pending.length > 0 && (
        <div className="rq" style={{ animation: 'none' }}>
          <div className="row-sb">
            <SecTitle sm color="#f5c542">Chờ duyệt</SecTitle>
            <span className="rq-pend">{pending.length} tài khoản</span>
          </div>
          {pending.map((m) => (
            <div key={m.id} className="mb-row" style={{ background: 'rgba(255,255,255,.03)' }}>
              <div className="mg-ph" style={{ background: m.avatar ? `center/cover url("${m.avatar}")` : 'rgba(255,255,255,.05)', borderRadius: '50%' }}>{m.avatar ? '' : ini(m.name)}</div>
              <div className="mg-info"><div><span>{m.name}</span></div><div>{m.email}</div></div>
              <div className="mb-acts">
                <button className="btn-ok" style={{ flex: 'none', padding: '10px 16px' }} onClick={() => openModal({ kind: 'approve', userId: m.id })}>Duyệt</button>
                <button className={'btn-no' + (rejecting === m.id ? ' on' : '')} style={{ flex: 'none', padding: '10px 16px', ...(rejecting === m.id ? { background: '#e5484d', color: '#fff' } : {}) }}
                  onClick={() => {
                    if (rejecting !== m.id) return setRejecting(m.id);
                    setRejecting(null);
                    run(() => api.rejectMember(m.id), `Đã từ chối ${m.name}`);
                  }}>{rejecting === m.id ? 'Xác nhận từ chối' : 'Từ chối'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input className="inp" style={{ maxWidth: 360 }} placeholder="Tìm theo tên hoặc email…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((m, i) => {
          const needsTeam = m.role === 'chair' || m.role === 'coach';
          const self = m.id === user?.id;
          return (
            <div key={m.id} className="mb-row" style={{ animationDelay: Math.min(i * 0.03, 0.5).toFixed(2) + 's' }}>
              <div className="mg-ph" style={{ background: m.avatar ? `center/cover url("${m.avatar}")` : 'rgba(255,255,255,.05)', borderRadius: '50%' }}>{m.avatar ? '' : ini(m.name)}</div>
              <div className="mg-info">
                <div><span>{m.name}{self ? ' (bạn)' : ''}</span></div>
                <div>{m.email}{(() => {
                  const pl = d.players.find((x) => x.userId === m.id);
                  return pl
                    ? <> · <a onClick={() => openCard(pl.id)}>⚽ Cầu thủ · {d.teams.find((t) => t.id === pl.teamId)?.short || 'Tự do'}</a></>
                    : <> · <a onClick={() => openModal({ kind: 'approve', userId: m.id })}>+ Tạo hồ sơ cầu thủ</a></>;
                })()}</div>
              </div>
              <div className="mb-acts">
                <select className="inp" value={m.role} disabled={self} aria-label="Vai trò" onChange={(e) => save(m.id, e.target.value as Role, m.team, m.name)}>
                  {(['member', 'coach', 'chair', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <select className="inp" value={needsTeam ? m.team || '' : ''} disabled={!needsTeam} aria-label="Đội" onChange={(e) => save(m.id, m.role, e.target.value, m.name)}>
                  {!needsTeam && <option value="">—</option>}
                  {d.teams.map((t) => <option key={t.id} value={t.id}>{t.short} · {t.name}</option>)}
                </select>
              </div>
            </div>
          );
        })}
        {!list.length && <div className="empty">{needle ? 'Không tìm thấy thành viên.' : 'Chưa có thành viên nào được duyệt.'}</div>}
      </div>
    </>
  );
}
