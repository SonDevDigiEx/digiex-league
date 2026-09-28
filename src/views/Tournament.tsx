import { useState } from 'react';
import { Crest, SecTitle } from '../components/bits';
import { Markdown } from '../components/Markdown';
import { api, hrefOf, useAccess, useLeague } from '../data/store';
import { Spin, useAction } from '../data/useAction';
import { dmy, fDate, fTime } from '../lib/league';
import { AWARD_KINDS, awardIcon, awardSuggestions, STATUS_LABEL, STRUCTURE_LABEL, tournamentTable, type AwardKind } from '../lib/tournament';
import type { Tournament as T } from '../lib/types';

function Trophy({ size = 64 }: { size?: number }) {
  return (
    <svg className="trophy" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff6c7" /><stop offset=".45" stopColor="#f5c542" /><stop offset="1" stopColor="#9c6f12" /></linearGradient>
      </defs>
      <path d="M18 8h28v10c0 10-6 17-14 17s-14-7-14-17z" fill="url(#tg)" />
      <path d="M18 12H9c0 8 4 12 10 13M46 12h9c0 8-4 12-10 13" fill="none" stroke="url(#tg)" strokeWidth="4" strokeLinecap="round" />
      <rect x="28" y="34" width="8" height="10" fill="url(#tg)" />
      <path d="M20 56h24l-3-10H23z" fill="url(#tg)" />
      <path d="M26 16l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#fffbe6" opacity=".85" transform="translate(6 -2)" />
    </svg>
  );
}

/** Chairmen register / withdraw their team while the tournament is upcoming. */
export function SignupButton({ t }: { t: T }) {
  const { user } = useLeague();
  const { myT, tm } = useAccess();
  const { act, pending, busy, wait } = useAction(3000);
  if (!user || !myT || t.status !== 'upcoming') return null;
  const joined = t.teams.some((x) => x.teamId === myT);
  const label = joined ? `Rút ${tm(myT).short} khỏi giải` : `Đăng ký ${tm(myT).short} tham gia`;
  return (
    <button className={'tb-join' + (joined ? ' joined' : '')} disabled={busy}
      onClick={(e) => { e.stopPropagation(); act('join', () => api.registerTournament(t.id, !joined), joined ? 'Đã rút đăng ký' : `Đã đăng ký ${tm(myT).name} tham gia giải`); }}
      onKeyDown={(e) => e.stopPropagation()}>
      {pending ? <><Spin /> Đang gửi…</> : wait ? `${joined ? '✓ Đã đăng ký' : label} (${wait}s)` : joined ? <>✓ Đã đăng ký · <u>Rút</u></> : label}
    </button>
  );
}

/** Ceremonial gold banner (home page + top of the tournament page). */
export function TournamentBanner({ t, onOpen }: { t: T; onOpen?: () => void }) {
  const { tm } = useAccess();
  const dates = [t.startsOn && dmy(t.startsOn), t.endsOn && dmy(t.endsOn)].filter(Boolean).join(' → ');
  return (
    <section className={'tbanner' + (onOpen ? ' click' : '')} onClick={onOpen} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => { if (onOpen && e.key === 'Enter') onOpen(); }}>
      <div className="tb-rays" /><div className="tb-shine" /><div className="tb-sparks" />
      <div className="tb-in">
        <Trophy size={78} />
        <div className="tb-text">
          <div className="tb-kicker"><span className={'tb-status s-' + t.status}>{STATUS_LABEL[t.status]}</span>{t.format === 's7' ? 'SÂN 7' : 'SÂN 5'} · {STRUCTURE_LABEL[t.structure]}</div>
          <h2 className="tb-name">{t.name}</h2>
          <div className="tb-meta">{t.teams.length} đội · {t.settings.weeks} tuần{dates ? ' · ' + dates : ''}</div>
        </div>
        <div className="tb-side">
          <div className="tb-teams-k">{t.teams.length ? `${t.teams.length} ĐỘI ĐÃ ĐĂNG KÝ` : t.status === 'upcoming' ? 'ĐANG MỞ ĐĂNG KÝ' : 'CHƯA CÓ ĐỘI'}</div>
          <div className="tb-teams">
            {t.teams.slice(0, 8).map((x, i) => <span key={x.teamId} className="tb-crest" style={{ animationDelay: i * 0.08 + 's' }} title={tm(x.teamId).name}><Crest team={tm(x.teamId)} text={false} /></span>)}
            {t.teams.length > 8 && <span className="tb-more">+{t.teams.length - 8}</span>}
            {!t.teams.length && <span className="tb-empty">?</span>}
          </div>
          <div className="tb-acts"><SignupButton t={t} />{onOpen && <span className="tb-cta">Xem thể lệ →</span>}</div>
        </div>
      </div>
    </section>
  );
}

export function Tournament({ id }: { id: string }) {
  const { snap, user, go, openModal, openCard, run } = useLeague();
  const { tm, isAdmin } = useAccess();
  const [confirmDel, setConfirmDel] = useState(false);
  const d = snap!;
  const t = d.tournaments.find((x) => x.id === id);
  if (!t) return <div className="view"><div className="empty">Không tìm thấy giải đấu.</div></div>;
  const matches = d.matches.filter((m) => m.tournamentId === t.id).sort((a, b) => a.date.localeCompare(b.date));
  const awards = d.awards.filter((a) => a.tournamentId === t.id);
  const groups = t.structure === 'groups' ? [...new Set(t.teams.map((x) => x.group).filter(Boolean) as string[])].sort() : [];
  const tables = groups.length
    ? groups.map((g) => ({ label: 'Bảng ' + g, rows: tournamentTable(t.teams.filter((x) => x.group === g).map((x) => x.teamId), matches, t.settings) }))
    : [{ label: 'Bảng xếp hạng', rows: tournamentTable(t.teams.map((x) => x.teamId), matches, t.settings) }];
  const s = t.settings;
  const info = [
    ['Sân', t.format === 's7' ? 'Sân 7' : 'Sân 5'], ['Thể thức', STRUCTURE_LABEL[t.structure]], ['Số đội', String(t.teams.length)],
    ['Độ dài', `${s.weeks} tuần · ${s.stages} chặng`], ['Quân số', `${s.squadMin}–${s.squadMax} (${s.starters} đá chính)`], ['Thời lượng', `${s.halves} × ${s.halfMin} phút`],
  ];

  return (
    <div className="view g20">
      <a className="back" href={hrefOf({ view: 'home' })} onClick={(e) => { e.preventDefault(); go({ view: 'home' }); }}>← Trang chủ</a>
      <TournamentBanner t={t} />
      {isAdmin && (
        <div className="t-admin">
          <select className="inp" value={t.status} aria-label="Trạng thái" onChange={(e) => run(() => api.updateTournament(t.id, { status: e.target.value as T['status'] }), 'Đã cập nhật trạng thái')}>
            <option value="upcoming">Sắp khởi tranh</option><option value="ongoing">Đang diễn ra</option><option value="finished">Đã kết thúc</option>
          </select>
          <button className="up" onClick={() => openModal({ kind: 'tournament', id: t.id })}>Sửa giải</button>
          {t.teams.length >= 2 && <button className="up" onClick={() => run(() => api.drawTournament(t.id), t.drawnAt ? 'Đã bốc thăm lại' : 'Đã bốc thăm')}>{t.drawnAt ? 'Bốc thăm lại' : 'Bốc thăm'}</button>}
          <button className={'btn-danger' + (confirmDel ? ' on' : '')} onClick={() => {
            if (!confirmDel) return setConfirmDel(true);
            run(() => api.deleteTournament(t.id), 'Đã xóa giải đấu').then((ok) => ok && go({ view: 'home' }));
          }}>{confirmDel ? 'Xác nhận xóa giải' : 'Xóa giải'}</button>
        </div>
      )}

      {!t.drawnAt && (
        <div className="t-draw-note">
          {t.teams.length < 2
            ? <>Giải đang mở đăng ký · <b>{t.teams.length}</b> đội. Chủ tịch các đội bấm <b>“Đăng ký tham gia”</b> trên banner.</>
            : <>Đã có <b>{t.teams.length}</b> đội đăng ký. {t.structure === 'league' ? 'BTC bấm “Bốc thăm” để xếp thứ tự.' : t.structure === 'groups' ? 'BTC bấm “Bốc thăm” để chia bảng ngẫu nhiên.' : 'BTC bấm “Bốc thăm” để xếp nhánh đấu.'}</>}
        </div>
      )}
      <div className="t-info">{info.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>

      {t.structure === 'knockout' && t.bracket ? (
        <section className="panel">
          <SecTitle sm>Nhánh đấu</SecTitle>
          <div className="bracket">
            {t.bracket.map((round, ri) => (
              <div key={ri} className="br-round">
                <div className="k10">{ri === t.bracket!.length - 1 ? 'CHUNG KẾT' : ri === t.bracket!.length - 2 ? 'BÁN KẾT' : `VÒNG ${ri + 1}`}</div>
                {round.map((m, mi) => (
                  <div key={mi} className="br-match">
                    {[m.home, m.away].map((x, k) => (
                      <div key={k} className={'br-slot' + (x ? '' : ' tbd')}>
                        {x ? <><Crest team={tm(x)} text={false} /><span>{tm(x).name}</span></> : <span>{ri === 0 ? 'Miễn đấu' : 'Chờ kết quả'}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="note">Nhánh đấu bốc thăm ngẫu nhiên{t.drawnAt ? ` lúc ${fTime(t.drawnAt)} ${fDate(t.drawnAt)}` : ''}. Đội gặp "Miễn đấu" vào thẳng vòng sau.</div>
        </section>
      ) : (
        <div className="two" style={{ animation: 'none' }}>
          {tables.map((tb) => (
            <section key={tb.label} className="panel">
              <SecTitle sm>{tb.label}</SecTitle>
              <div className="t-table">
                <div className="t-row t-head"><span>#</span><span>ĐỘI</span><span>TR</span><span>T</span><span>H</span><span>B</span><span>HS</span><span>Đ</span></div>
                {tb.rows.map((r, i) => (
                  <a key={r.team} className="t-row" href={hrefOf({ view: 'teams', teamId: r.team })} onClick={(e) => { e.preventDefault(); go({ view: 'teams', teamId: r.team }); }}>
                    <span className="tbl-rank">{i + 1}</span>
                    <span className="tbl-team"><Crest team={tm(r.team)} text={false} /><span>{tm(r.team).name}</span></span>
                    <span>{r.p}</span><span>{r.w}</span><span>{r.d}</span><span>{r.l}</span><span>{(r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga)}</span><b>{r.pts}</b>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="two" style={{ animation: 'none' }}>
        <section className="panel">
          <SecTitle sm>Điểm đội</SecTitle>
          <div className="pts-grid">
            <div><b>{s.pts.win}</b><span>Thắng</span></div><div><b>{s.pts.shootoutWin}/{s.pts.shootoutLoss}</b><span>Hòa → luân lưu</span></div>
            <div><b>{s.pts.loss}</b><span>Thua</span></div><div><b>+{s.pts.closeLossBonus}</b><span>Thua ≤ 1 bàn</span></div><div><b>{s.pts.noShow}</b><span>Thiếu người không báo</span></div>
          </div>
        </section>
        <section className="panel">
          <SecTitle sm color="#f5c542">Điểm cá nhân</SecTitle>
          <div className="pts-grid">
            <div><b>+{s.personal.attend}</b><span>Có mặt</span></div><div><b>+{s.personal.goal}</b><span>Ghi bàn</span></div><div><b>+{s.personal.assist}</b><span>Kiến tạo</span></div>
            <div><b>+{s.personal.mvp}</b><span>MVP trận</span></div><div><b>+{s.personal.cleanSheet}</b><span>Giữ sạch lưới</span></div><div><b>{s.personal.absent}</b><span>Vắng không báo</span></div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="row-sb wrap"><SecTitle sm color="#f5c542">Giải thưởng</SecTitle></div>
        {!awards.length && <div className="note">{t.status === 'finished' ? 'Chưa trao giải.' : 'Giải thưởng sẽ được trao khi kết thúc chặng / mùa.'}</div>}
        <div className="awards">
          {awards.map((a) => {
            const p = a.playerId ? d.players.find((x) => x.id === a.playerId) : undefined;
            return (
              <div key={a.id} className="award">
                <span className="aw-icon">{awardIcon(a.kind)}</span>
                <div>
                  <b>{a.title}</b>
                  <span>{a.playerId || a.playerName ? <a onClick={() => p && openCard(p.id)}>{p?.name || a.playerName}</a> : null}{a.teamId ? `${a.playerId || a.playerName ? ' · ' : ''}${tm(a.teamId).name}` : ''}</span>
                  {a.note && <em>{a.note}</em>}
                </div>
                {isAdmin && <button className="fm-x" style={{ marginLeft: 'auto' }} aria-label="Xóa giải thưởng" onClick={() => run(() => api.deleteAward(a.id), 'Đã xóa giải thưởng')}>×</button>}
              </div>
            );
          })}
        </div>
        {isAdmin && user && <AwardForm t={t} />}
      </section>

      {matches.length > 0 && (
        <section className="panel">
          <SecTitle sm>Trận đấu của giải · {matches.length}</SecTitle>
          {matches.map((m) => (
            <a key={m.id} className="t-match" href={hrefOf({ view: 'match', matchId: m.id })} onClick={(e) => { e.preventDefault(); go({ view: 'match', matchId: m.id }); }}>
              <span className="note">{m.stage || fDate(m.date)}</span>
              <span>{tm(m.home).short} <b>{m.status === 'done' ? `${m.hs} - ${m.as}` : m.status === 'cancelled' ? 'HỦY' : 'vs'}</b> {tm(m.away).short}</span>
              <span className="note">{fDate(m.date)}</span>
            </a>
          ))}
        </section>
      )}

      <section className="panel rules"><SecTitle sm>Thể lệ &amp; cơ chế giải</SecTitle><Markdown text={t.rulesMd} /></section>
    </div>
  );
}

/** Admin: give an award; suggestions come from approved stats of the tournament's matches. */
function AwardForm({ t }: { t: T }) {
  const { snap } = useLeague();
  const { tm } = useAccess();
  const { act, pending, busy } = useAction();
  const d = snap!;
  const [kind, setKind] = useState<AwardKind>('champion');
  const [title, setTitle] = useState('Đội vô địch');
  const [team, setTeam] = useState(t.teams[0]?.teamId || '');
  const [player, setPlayer] = useState('');
  const [note, setNote] = useState('');
  const def = AWARD_KINDS.find((a) => a.kind === kind)!;
  const matches = d.matches.filter((m) => m.tournamentId === t.id);
  const sugg = awardSuggestions(matches, d.participants, d.players, t.settings);
  const table = tournamentTable(t.teams.map((x) => x.teamId), matches, t.settings);
  const unit: Record<string, string> = { top_scorer: 'bàn', top_assist: 'kiến tạo', attendance: 'trận', golden_glove: 'trận sạch lưới', mvp: 'điểm' };
  const hint = def.team
    ? (table.length ? (kind === 'champion' ? table[0] : table[1]) : null)
    : (sugg as Record<string, { playerId: string; value: number } | null>)[kind] ?? null;
  const pickKind = (k: AwardKind) => {
    setKind(k); setTitle(AWARD_KINDS.find((a) => a.kind === k)!.title); setNote('');
  };
  const inTour = new Set(t.teams.map((x) => x.teamId));
  const candidates = d.players.filter((p) => !p.teamId || inTour.has(p.teamId)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const applyHint = () => {
    if (!hint) return;
    if ('team' in hint) { setTeam(hint.team); setNote(`${hint.pts} điểm`); }
    else { setPlayer(hint.playerId); setNote(`${hint.value} ${unit[kind] || ''}`.trim()); }
  };
  const submit = () => {
    const p = d.players.find((x) => x.id === player);
    return act('add', () => api.addAward({
      tournamentId: t.id, kind, title, note: note.trim() || null,
      teamId: def.team ? team : p?.teamId ?? null, playerId: def.team ? null : p?.id ?? null, playerName: def.team ? null : p?.name ?? null,
    }), 'Đã trao giải ' + title);
  };
  return (
    <div className="stat-box" style={{ marginTop: 6 }}>
      <div className="stat-box-h"><span>TRAO GIẢI</span></div>
      <div className="opts">{AWARD_KINDS.map((a) => <button type="button" key={a.kind} className={'opt vn' + (kind === a.kind ? ' on' : '')} onClick={() => pickKind(a.kind)}>{a.icon} {a.title}</button>)}</div>
      <div className="g2">
        <label className="fld">Tên giải<input className="inp" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></label>
        {def.team
          ? <label className="fld">Đội<select className="inp" value={team} onChange={(e) => setTeam(e.target.value)}>{t.teams.map((x) => <option key={x.teamId} value={x.teamId}>{tm(x.teamId).name}</option>)}</select></label>
          : <label className="fld">Cầu thủ<select className="inp" value={player} onChange={(e) => setPlayer(e.target.value)}><option value="">— Chọn —</option>{candidates.map((p) => <option key={p.id} value={p.id}>{p.name} · {tm(p.teamId).short}</option>)}</select></label>}
      </div>
      <label className="fld">Ghi chú<input className="inp" value={note} maxLength={200} placeholder="VD: 12 bàn" onChange={(e) => setNote(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {hint && <button type="button" className="ph-btn grey" onClick={applyHint}>Gợi ý: {'team' in hint ? `${tm(hint.team).name} (${hint.pts} điểm)` : `${d.players.find((p) => p.id === hint.playerId)?.name} (${hint.value} ${unit[kind] || ''})`}</button>}
        <button type="button" className="btn-lime" disabled={busy || (!def.team && !player) || !title.trim()} onClick={submit}>{pending ? 'Đang lưu…' : 'Trao giải'}</button>
      </div>
      <div className="note">Gợi ý dựa trên các trận thuộc giải và thống kê cá nhân đã được BHL duyệt.</div>
    </div>
  );
}

