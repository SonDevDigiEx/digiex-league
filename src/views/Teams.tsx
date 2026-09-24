import { Crest, PlayerCard, SecTitle } from '../components/bits';
import { api, squadOf, useAccess, useLeague } from '../data/store';
import { GNAME, GROUP, hexA, ini, readImg, record, sortedMatches } from '../lib/league';
import type { Group } from '../lib/types';

/** File input handler: downscale then upload as the team logo. */
export function useLogoUpload() {
  const { run } = useLeague();
  return (teamId: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run(async () => api.setTeamLogo(teamId, await readImg(file, 256, 'image/png')), 'Đã cập nhật logo đội');
  };
}

export function Teams({ teamId }: { teamId?: string }) {
  const { snap, go, openCard, openModal, user } = useLeague();
  const { isAdmin, canTeam } = useAccess();
  const onLogo = useLogoUpload();
  const d = snap!;
  const T = d.teams;
  const ct = T.find((t) => t.id === (teamId || user?.team)) || T[0];
  if (!ct) return <div className="view"><div className="empty">Chưa có đội nào.</div></div>;
  const sq = squadOf(d.players, ct.id);
  const tr = record(sortedMatches(d.matches).done, ct.id);
  const val = sq.reduce((a, p) => a + p.value, 0);
  const avg = sq.length ? Math.round(sq.reduce((a, p) => a + p.ovr, 0) / sq.length) : 0;
  const can = canTeam(ct.id);
  const kpis = [{ l: 'GIÁ TRỊ ĐỘI HÌNH', v: val.toFixed(1) + ' tỷ', c: '#f5c542' }, { l: 'OVR TRUNG BÌNH', v: avg, c: '#c6ff3d' }, { l: 'THẮNG · HÒA · BẠI', v: `${tr.w}-${tr.d}-${tr.l}`, c: '#fff' }, { l: 'BÀN THẮNG', v: tr.gf, c: '#fff' }, { l: 'ĐIỂM', v: tr.pts, c: '#fff' }];
  let ci = 0;
  const groups = (['GK', 'DEF', 'MID', 'FWD'] as Group[]).map((g) => ({ g, cards: sq.filter((p) => GROUP[p.pos] === g).sort((a, b) => b.ovr - a.ovr) })).filter((x) => x.cards.length);

  return (
    <div className="view g22">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {T.map((t) => {
          const on = t.id === ct.id;
          return (
            <button key={t.id} className="pill" style={on ? { background: hexA(t.color, 0.22), color: '#fff' } : undefined} onClick={() => go({ view: 'teams', teamId: t.id })}>
              <span className="dot" style={{ background: t.color }} />{t.name}
            </button>
          );
        })}
        {isAdmin && <button className="pill add" onClick={() => openModal({ kind: 'addTeam' })}>+ Thêm đội</button>}
      </div>

      <section className="team-hero" style={{ background: `linear-gradient(120deg,${ct.color2} 0%,#0a0e17 62%)` }}>
        <div className="team-ghost">{ct.short}</div>
        <div className="team-top">
          <div className="team-id">
            <Crest team={ct} key={ct.id} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="team-founded">THÀNH LẬP {ct.founded}</div>
              <h1 className="team-name">{ct.name}</h1>
              <div className="team-motto">“{ct.motto}”</div>
              {can && <label className="btn-upload">Tải logo đội<input type="file" accept="image/*" onChange={onLogo(ct.id)} /></label>}
            </div>
          </div>
          <div className="chair">
            <div className="chair-ava">{ini(ct.chair.name)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="chair-k">CHỦ TỊCH · TỪ {ct.chair.since}</div>
              <div className="chair-n">{ct.chair.name}</div>
              <div className="chair-q">{ct.chair.quote}</div>
              <div className="chair-q">BHL: <span style={{ color: '#fff', fontWeight: 600 }}>{ct.coach.name || 'Chưa bổ nhiệm'}</span></div>
            </div>
          </div>
        </div>
        <div className="kpis">
          {kpis.map((k, i) => <div key={k.l} className="kpi" style={{ animationDelay: i * 0.07 + 's' }}><span>{k.l}</span><b style={{ color: k.c }}>{k.v}</b></div>)}
        </div>
      </section>

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
