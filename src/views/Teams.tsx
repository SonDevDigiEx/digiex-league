import { useState } from 'react';
import { ImageCropper, CREST_ASPECT } from '../components/ImageCropper';
import { TeamLineupCard } from './Lineups';
import { Crest, PlayerCard, SecTitle } from '../components/bits';
import { api, hrefOf, squadOf, useAccess, useLeague } from '../data/store';
import { GNAME, GROUP, hexA, ini, readImg, record, sortedMatches } from '../lib/league';
import { awardIcon } from '../lib/tournament';
import { ApplicationsBox, ApplyButton } from '../components/Applications';
import type { Group } from '../lib/types';

/** "Upload logo" button: pick → crop in the crest shape → upload. */
export function LogoUpload({ teamId, className = 'btn-upload', label = 'Tải logo đội' }: { teamId: string; className?: string; label?: string }) {
  const { run } = useLeague();
  const [crop, setCrop] = useState<File | null>(null);
  return (
    <>
      <label className={className}>{label}<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCrop(f); }} /></label>
      {crop && <ImageCropper file={crop} aspect={CREST_ASPECT} outH={320} title="Căn chỉnh logo đội" onCancel={() => setCrop(null)}
        onDone={(blob) => { setCrop(null); run(() => api.setTeamLogo(teamId, blob), 'Đã cập nhật logo đội'); }} />}
    </>
  );
}

/** File input handler: downscale then upload as the team cover photo. */
function useCoverUpload() {
  const { run } = useLeague();
  return (teamId: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run(async () => api.setTeamCover(teamId, await readImg(file, 1400, 'image/jpeg')), 'Đã cập nhật ảnh bìa');
  };
}

export function Teams({ teamId }: { teamId?: string }) {
  const { snap, go, openCard, openModal, user } = useLeague();
  const { isAdmin, canTeam } = useAccess();
  const onCover = useCoverUpload();
  const { run } = useLeague();
  const d = snap!;
  const T = d.teams;
  const ct = T.find((t) => t.id === (teamId || user?.team)) || T[0];
  if (!ct) return <div className="view"><div className="empty">Chưa có đội nào.</div></div>;
  const sq = squadOf(d.players, ct.id);
  const tr = record(sortedMatches(d.matches).done, ct.id);
  const val = sq.reduce((a, p) => a + p.value, 0);
  const avg = sq.length ? Math.round(sq.reduce((a, p) => a + p.ovr, 0) / sq.length) : 0;
  const can = canTeam(ct.id);
  const kpis = [{ l: 'THÀNH VIÊN', v: sq.length + ' người', c: '#fff' }, { l: 'GIÁ TRỊ ĐỘI HÌNH', v: val.toFixed(1) + ' tỷ', c: '#f5c542' }, { l: 'OVR TRUNG BÌNH', v: avg, c: '#c6ff3d' }, { l: 'THẮNG · HÒA · BẠI', v: `${tr.w}-${tr.d}-${tr.l}`, c: '#fff' }, { l: 'BÀN THẮNG', v: tr.gf, c: '#fff' }, { l: 'ĐIỂM', v: tr.pts, c: '#fff' }];
  const tourName = (id: string) => d.tournaments.find((x) => x.id === id)?.name || 'Giải đấu';
  const teamAwards = d.awards.filter((a) => a.teamId === ct.id);
  // Team trophies first, then individual awards won by its players.
  const trophies = teamAwards.filter((a) => !a.playerId && !a.playerName);
  const personal = teamAwards.filter((a) => a.playerId || a.playerName);
  // Chairman / BHL come live from the accounts holding the role (name + photo follow the profile);
  // the stored text on the team is only a fallback (e.g. for guests, who can't read member profiles).
  const chairAcc = d.members.find((m) => m.role === 'chair' && m.team === ct.id);
  const chairCard = chairAcc ? d.players.find((p) => p.userId === chairAcc.id) : undefined;
  const chairName = chairAcc?.name || ct.chair.name;
  const chairAva = chairCard?.photo || chairAcc?.avatar || null;
  const coachNames = d.members.filter((m) => m.role === 'coach' && m.team === ct.id).map((m) => m.name).join(', ') || (d.members.length ? '' : ct.coach.name);
  let ci = 0;
  const groups = (['GK', 'DEF', 'MID', 'FWD'] as Group[]).map((g) => ({ g, cards: sq.filter((p) => GROUP[p.pos] === g).sort((a, b) => b.ovr - a.ovr) })).filter((x) => x.cards.length);

  return (
    <div className="view g22">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {T.map((t) => {
          const on = t.id === ct.id;
          return (
            <button key={t.id} className="pill" style={on ? { background: hexA(t.color, 0.22), color: '#fff' } : undefined} onClick={() => go({ view: 'teams', teamId: t.id })}>
              <span className="dot" style={{ background: t.color }} />{t.name}<span className="pill-n" title="Số thành viên">{squadOf(d.players, t.id).length}</span>
            </button>
          );
        })}
        {isAdmin && <button className="pill add" onClick={() => openModal({ kind: 'addTeam' })}>+ Thêm đội</button>}
      </div>

      <section className={'team-hero' + (ct.cover ? ' has-cover' : '')} style={{ background: `linear-gradient(120deg,${ct.color2} 0%,#0a0e17 62%)` }}>
        {ct.cover && <div className="team-cover" style={{ backgroundImage: `url(${ct.cover})` }} />}
        <div className="team-ghost">{ct.short}</div>
        <div className="team-top">
          <div className="team-id">
            <Crest team={ct} key={ct.id} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="team-founded">THÀNH LẬP {ct.founded}</div>
              <h1 className="team-name">{ct.name}</h1>
              <div className="team-motto">“{ct.motto}”</div>
              <ApplyButton teamId={ct.id} />
              {can && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-upload" onClick={() => openModal({ kind: 'editTeam', teamId: ct.id })}>Sửa thông tin</button>
                  <LogoUpload teamId={ct.id} />
                  <button className="btn-upload" onClick={() => openModal({ kind: 'lineup', teamId: ct.id })}>⚙ Xếp đội hình</button>
                  <label className="btn-upload">{ct.cover ? 'Đổi ảnh bìa' : 'Tải ảnh bìa'}<input type="file" accept="image/*" onChange={onCover(ct.id)} /></label>
                  {ct.cover && <button className="btn-upload" onClick={() => run(() => api.setTeamCover(ct.id, null), 'Đã xóa ảnh bìa')}>Xóa ảnh bìa</button>}
                </div>
              )}
            </div>
          </div>
          <div className="chair">
            <div className="chair-ava" style={chairAva ? { background: `center/cover no-repeat url("${chairAva}")` } : undefined}>{chairAva ? '' : ini(chairName)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="chair-k">CHỦ TỊCH · TỪ {ct.chair.since}</div>
              <div className="chair-n">{chairName}</div>
              <div className="chair-q">{ct.chair.quote}</div>
              <div className="chair-q">BHL: <span style={{ color: '#fff', fontWeight: 600 }}>{coachNames || 'Chưa bổ nhiệm'}</span></div>
            </div>
          </div>
        </div>
        <div className="kpis">
          {kpis.map((k, i) => <div key={k.l} className="kpi" style={{ animationDelay: i * 0.07 + 's' }}><span>{k.l}</span><b style={{ color: k.c }}>{k.v}</b></div>)}
        </div>
      </section>

      <ApplicationsBox teamId={ct.id} />
      {teamAwards.length > 0 && (
        <section className="panel">
          <SecTitle sm color="#f5c542">Lịch sử giải thưởng · {teamAwards.length}</SecTitle>
          {trophies.length > 0 && <div className="trophy-shelf">{trophies.map((a) => (
            <a key={a.id} className={'shelf-item k-' + a.kind} href={hrefOf({ view: 'tournament', id: a.tournamentId })} onClick={(e) => { e.preventDefault(); go({ view: 'tournament', id: a.tournamentId }); }}>
              <span className="aw-icon">{awardIcon(a.kind)}</span><b>{a.title}</b><span>{tourName(a.tournamentId)}</span>
            </a>
          ))}</div>}
          {personal.length > 0 && <div className="awards">{personal.map((a) => {
            const p = a.playerId ? d.players.find((x) => x.id === a.playerId) : undefined;
            return (
              <div key={a.id} className="award">
                <span className="aw-icon">{awardIcon(a.kind)}</span>
                <div><b>{a.title}</b><span>{p ? <a onClick={() => openCard(p.id)}>{p.name}</a> : a.playerName} · {tourName(a.tournamentId)}</span>{a.note && <em>{a.note}</em>}</div>
              </div>
            );
          })}</div>}
        </section>
      )}

      <TeamLineupCard key={ct.id} team={ct} lineups={d.lineups.filter((l) => l.teamId === ct.id)} />

      <div className="row-sb wrap">
        <SecTitle>Đội hình · {sq.length} cầu thủ</SecTitle>
        {can && <button className="btn-lime" onClick={() => openModal({ kind: 'player', teamId: ct.id })}>+ Thêm cầu thủ</button>}
      </div>
      {!sq.length && <div className="empty">Đội chưa có cầu thủ. Thêm mới hoặc mua từ thị trường chuyển nhượng.</div>}
      {groups.map(({ g, cards }) => (
        <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="kicker">{GNAME[g]} · {cards.length}</div>
          <div className="card-wrap">
            {cards.map((p) => <PlayerCard key={p.id} p={p} team={ct} delay={ci++ * 0.05} onClick={() => openCard(p.id)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
