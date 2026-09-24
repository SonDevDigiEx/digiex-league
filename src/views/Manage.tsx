import { useState } from 'react';
import { Crest, SecTitle } from '../components/bits';
import { api, squadOf, useAccess, useLeague } from '../data/store';
import { GORD, GROUP, hexA, ini, money, ROLE_LABEL, tier } from '../lib/league';
import { useLogoUpload } from './Teams';

export function Manage({ teamId }: { teamId?: string }) {
  const { snap, user, go, openModal, run } = useLeague();
  const { canTeam, canAny } = useAccess();
  const onLogo = useLogoUpload();
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  if (!user || !canAny) return <div className="view"><div className="empty">Bạn không có quyền quản lý đội.</div></div>;
  const d = snap!;
  const mTeams = d.teams.filter((t) => canTeam(t.id));
  const mt = mTeams.find((t) => t.id === (teamId || user.team)) || mTeams[0];
  if (!mt) return <div className="view"><div className="empty">Chưa có đội nào.</div></div>;
  const rows = squadOf(d.players, mt.id).sort((a, b) => GORD[GROUP[a.pos]] - GORD[GROUP[b.pos]] || b.ovr - a.ovr);

  return (
    <div className="view g20">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="h1">Quản lý đội</h1>
        <div className="lead">Quyền của bạn: <span style={{ color: '#c6ff3d', fontWeight: 600 }}>{ROLE_LABEL[user.role] + (user.team ? ' · ' + (d.teams.find((t) => t.id === user.team)?.short || '') : '')}</span> · thêm, chỉnh sửa, xóa cầu thủ và cập nhật logo đội.</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {mTeams.map((t) => (
          <button key={t.id} className="pill" style={t.id === mt.id ? { background: hexA(t.color, 0.22), color: '#fff' } : undefined}
            onClick={() => { setPendingDel(null); go({ view: 'manage', teamId: t.id }); }}>
            <span className="dot" style={{ background: t.color, border: 0 }} />{t.name}
          </button>
        ))}
      </div>
      <section className="mg-team">
        <Crest team={mt} key={mt.id} />
        <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="mg-team-n">{mt.name}</div>
          <div className="lead" style={{ fontSize: 13 }}>Chủ tịch: <span style={{ color: '#fff' }}>{mt.chair.name}</span> · BHL: <span style={{ color: '#fff' }}>{mt.coach.name || '—'}</span></div>
        </div>
        <div className="mg-acts">
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
