import { useState } from 'react';
import { Crest, SecTitle } from '../components/bits';
import { api, squadOf, useAccess, useLeague } from '../data/store';
import { GORD, GROUP, hexA, ini, money, ROLE_LABEL, tier } from '../lib/league';
import type { Role } from '../lib/types';
import { useLogoUpload } from './Teams';

const MEMBERS = 'members';

export function Manage({ teamId }: { teamId?: string }) {
  const { snap, user, go, openModal, run } = useLeague();
  const { canTeam, canAny, isAdmin } = useAccess();
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
        <span className="dot" style={{ background: '#c6ff3d', border: 0 }} />Thành viên · {d.members.length}
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
  const { snap, user, run } = useLeague();
  const [q, setQ] = useState('');
  const d = snap!;
  const needle = q.trim().toLowerCase();
  const order: Record<Role, number> = { admin: 0, chair: 1, coach: 2, member: 3 };
  const list = d.members
    .filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle))
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name, 'vi'));
  const save = (id: string, role: Role, team: string | null, name: string) => {
    if ((role === 'chair' || role === 'coach') && !team) team = d.teams[0]?.id ?? null;
    run(() => api.setMember(id, role, role === 'chair' || role === 'coach' ? team : null), `Đã cập nhật quyền cho ${name}`);
  };
  return (
    <>
      <div className="note" style={{ fontSize: 13 }}>
        Mọi người đăng nhập bằng Google công ty sẽ xuất hiện ở đây với vai trò Thành viên. Mỗi đội có một Chủ tịch — chỉ định Chủ tịch mới sẽ đưa Chủ tịch cũ về Thành viên.
      </div>
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
                <div>{m.email}</div>
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
        {!list.length && <div className="empty">{needle ? 'Không tìm thấy thành viên.' : 'Chưa có ai đăng nhập.'}</div>}
      </div>
    </>
  );
}
