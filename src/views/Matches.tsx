import { useState } from 'react';
import { Crest, Lock } from '../components/bits';
import { api, findMatch, hrefOf, squadOf, useAccess, useLeague, useNow } from '../data/store';
import { clamp, fDate, fTime, FORMATION, hexA, lineup, record, sortedMatches } from '../lib/league';
import type { Goal, Match, Player, Team, WinnerKey } from '../lib/types';
import { MatchStats, participantsOf, Rsvp } from './MatchPlayers';
import { Pitch, Token } from '../components/Pitch';
import { FORMAT_LABEL, liveSlots, type Format } from '../lib/formation';
import { FameAvatar } from './Fame';
import { Spin, useAction } from '../data/useAction';

export function Countdown({ iso, small }: { iso: string; small?: boolean }) {
  const now = useNow();
  let x = Math.max(0, new Date(iso).getTime() - now) / 1000;
  const dd = Math.floor(x / 86400); x -= dd * 86400;
  const hh = Math.floor(x / 3600); x -= hh * 3600;
  const mm = Math.floor(x / 60);
  const ss = Math.floor(x - mm * 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className={'cd' + (small ? ' sm' : '')}>
      {[[dd, 'NGÀY'], [hh, 'GIỜ'], [mm, 'PHÚT'], [ss, 'GIÂY']].map(([v, l]) => <div key={l}><b>{pad(v as number)}</b><span>{l}</span></div>)}
    </div>
  );
}

export function Matches() {
  const { snap, go, openModal } = useLeague();
  const { tm, isAdmin } = useAccess();
  const { ups, history } = sortedMatches(snap!.matches);
  const T = snap!.teams;
  const link = (m: Match) => ({ href: hrefOf({ view: 'match', matchId: m.id }), onClick: (e: React.MouseEvent) => { e.preventDefault(); go({ view: 'match', matchId: m.id }); } });

  return (
    <div className="view g22">
      <div className="row-sb wrap">
        <h1 className="h1">Lịch thi đấu</h1>
        {isAdmin && T.length > 1 && <button className="btn-lime" style={{ padding: '12px 20px' }} onClick={() => openModal({ kind: 'schedule' })}>+ Lên lịch trận</button>}
      </div>
      <div className="kicker" style={{ color: '#c6ff3d' }}>SẮP DIỄN RA</div>
      {ups.map((m, i) => {
        const H = tm(m.home), A = tm(m.away);
        return (
          <a key={m.id} className="up-card" {...link(m)} style={{ animationDelay: (i * 0.06).toFixed(2) + 's', background: `linear-gradient(90deg,${hexA(H.color, 0.3)},rgba(14,19,30,.95) 35%,rgba(14,19,30,.95) 65%,${hexA(A.color, 0.3)})` }}>
            <div className="up-side h"><span>{H.name}</span><Crest team={H} /></div>
            <div className="up-mid"><div className="up-time">{fTime(m.date)}</div><div className="up-vs">VS</div><div className="up-date">{fDate(m.date)}</div></div>
            <div className="up-side"><Crest team={A} /><span>{A.name}</span></div>
          </a>
        );
      })}
      {!ups.length && <div className="none">Chưa có trận nào được lên lịch.</div>}

      <div className="kicker" style={{ marginTop: 8 }}>LỊCH SỬ THI ĐẤU</div>
      <div className="tl">
        <div className="tl-line" />
        {!history.length && <div className="none">Chưa có trận nào kết thúc.</div>}
        {history.slice().reverse().map((m, i) => {
          const H = tm(m.home), A = tm(m.away);
          const off = m.status === 'cancelled';
          return (
            <a key={m.id} className={'tl-item' + (off ? ' off' : '')} {...link(m)} style={{ animationDelay: (i * 0.06).toFixed(2) + 's' }}>
              <div className="tl-dot" />
              <div className="tl-side h" style={{ opacity: !off && m.hs < m.as ? 0.45 : 1 }}><span>{H.name}</span><Crest team={H} text={false} /></div>
              <div className="tl-mid">{off ? <b className="tl-off">HỦY</b> : <b>{m.hs} - {m.as}</b>}<span>{fDate(m.date)}</span>{off && m.cancelReason && <span className="tl-why">{m.cancelReason}</span>}</div>
              <div className="tl-side" style={{ opacity: !off && m.as < m.hs ? 0.45 : 1 }}><Crest team={A} text={false} /><span>{A.name}</span></div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

type Tab = 'lineup' | 'stats' | 'vote' | 'record';
const WDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];


export function MatchDetail({ matchId }: { matchId: string }) {
  const { snap, go, openCard, openModal, user, run } = useLeague();
  const { tm, isAdmin, canVote, canTeam } = useAccess();
  const [tab, setTab] = useState<Tab>('lineup');
  const [vs, setVs] = useState({ h: 1, a: 1 });
  const d = snap!;
  const m = findMatch(d.matches, matchId);
  if (!m) return <div className="view"><a className="back" onClick={() => go({ view: 'matches' })}>← Lịch thi đấu</a><div className="none">Không tìm thấy trận đấu.</div></div>;

  const H = tm(m.home), A = tm(m.away);
  const isDone = m.status === 'done';
  const isOff = m.status === 'cancelled';
  const series = m.seriesId ? d.series.find((s) => s.id === m.seriesId) : undefined;
  const canCancel = m.status === 'up' && !!user && (isAdmin || (user.role === 'chair' && (user.team === m.home || user.team === m.away)));
  const { done } = sortedMatches(d.matches);
  // Once players have registered, the lineup is built from the registered list (incl. free agents); otherwise the whole squad.
  const reg = participantsOf(d.participants, m.id);
  const roster = (tid: string) => {
    const ids = new Set(reg.filter((r) => r.teamId === tid).map((r) => r.playerId));
    return ids.size ? d.players.filter((p) => ids.has(p.id)) : squadOf(d.players, tid);
  };
  const fromRsvp = reg.length > 0;
  // A team's saved lineup (chairman / BHL) wins; otherwise the auto lineup from the roster.
  const tour = m.tournamentId ? d.tournaments.find((t) => t.id === m.tournamentId) : undefined;
  const fmt: Format = tour?.format ?? 's7';
  const Y = [93, 80, 68, 56];
  const side = (t: Team, flip: boolean) => {
    const saved = d.lineups.find((l) => l.teamId === t.id && l.format === fmt);
    const squad = squadOf(d.players, t.id);
    if (saved) {
      const byId = new Map(squad.map((p) => [p.id, p]));
      const slots = liveSlots(saved, squad);
      const starters = slots.map((s) => (s.pid ? byId.get(s.pid) : undefined)).filter(Boolean) as Player[];
      const ids = new Set(starters.map((p) => p.id));
      const pool = roster(t.id);
      return {
        rows: [starters], bench: pool.filter((p) => !ids.has(p.id)), label: saved.formation, saved: true,
        toks: slots.map((s) => ({ p: s.pid ? byId.get(s.pid) ?? null : null, x: flip ? 100 - s.x : s.x, y: flip ? 50 - s.y / 2 : 50 + s.y / 2 })),
      };
    }
    const l = lineup(roster(t.id));
    return {
      ...l, label: FORMATION, saved: false,
      toks: l.rows.flatMap((row, ri) => row.map((p, i) => ({ p: p as Player | null, x: ((i + 1) / (row.length + 1)) * 100, y: flip ? 100 - Y[ri] : Y[ri] }))),
    };
  };
  const lH = side(H, false), lA = side(A, true);

  // Analysis
  const sH = lH.rows.flat(), sA = lA.rows.flat(), oH = sH.filter((p) => p.pos !== 'GK'), oA = sA.filter((p) => p.pos !== 'GK');
  const av = (arr: Player[], f: (p: Player) => number) => (arr.length ? Math.round(arr.reduce((a, p) => a + f(p), 0) / arr.length) : 0);
  const defs: [string, (p: Player) => number, Player[], Player[]][] = [['Chỉ số tổng', (p) => p.ovr, sH, sA], ['Tốc độ', (p) => p.stats[0], oH, oA], ['Dứt điểm', (p) => p.stats[1], oH, oA], ['Chuyền bóng', (p) => p.stats[2], oH, oA], ['Rê bóng', (p) => p.stats[3], oH, oA], ['Phòng ngự', (p) => p.stats[4], oH, oA], ['Thể lực', (p) => p.stats[5], oH, oA]];
  const cmp = (l: string, a: number | string, b: number | string) => {
    const t = +a + +b || 1;
    return { l, a, b, wa: ((+a / t) * 100).toFixed(1) + '%', wb: ((+b / t) * 100).toFixed(1) + '%', ca: +a >= +b ? H.color : '#394052', cb: +b >= +a ? A.color : '#394052' };
  };
  const rows = defs.map(([l, f, x, y]) => cmp(l, av(x, f), av(y, f)));
  rows.push(cmp('Giá trị (tỷ)', sH.reduce((a, p) => a + p.value, 0).toFixed(1), sA.reduce((a, p) => a + p.value, 0).toFixed(1)));
  const diff = av(sH, (p) => p.ovr) - av(sA, (p) => p.ovr);
  const ph = 1 / (1 + Math.exp(-diff / 2.5));
  const dp = 22, hp = Math.round((100 - dp) * ph), ap = 100 - dp - hp;

  // Votes
  const my = d.my[m.id] || {};
  const v = m.votes, vt = v.home + v.draw + v.away || 1;
  const voted = !!my.winner || isDone || isOff || !canVote;
  const actual: WinnerKey | null = isDone ? (m.hs > m.as ? 'home' : m.hs < m.as ? 'away' : 'draw') : null;
  const ak = `${m.hs}-${m.as}`;
  const sv = Object.entries(m.sv || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const mx = sv.length ? sv[0][1] : 1;
  const acc = actual ? Math.round((v[actual] / vt) * 100) : 0;
  const pn = (id: string) => { const p = d.players.find((x) => x.id === id); return p ? p.name.split(' ').slice(-2).join(' ') : '?'; };
  const goals = (side: 'home' | 'away') => (m.scorers || []).filter((g) => g.side === side).map((g, i) => <span key={i}>⚽ {pn(g.pid)}{g.min != null ? ` ${g.min}'` : ''}</span>);
  const li = (p: Player, sub?: boolean) => (
    <button key={p.id} className={'li' + (sub ? ' sub' : '')} onClick={() => openCard(p.id)}><span>{p.pos}</span><span>{p.name}</span><span>{p.ovr}</span></button>
  );
  const login = () => openModal({ kind: 'login' });
  const step = (set: typeof setVs, key: 'h' | 'a', dl: number, max: number) => () => set((s) => ({ ...s, [key]: clamp(s[key] + dl, 0, max) }));

  return (
    <div className="view g20">
      <a className="back" href={hrefOf({ view: 'matches' })} onClick={(e) => { e.preventDefault(); go({ view: 'matches' }); }}>← Lịch thi đấu</a>
      <section className="mhero">
        <div className="hero-glow" style={{ background: `radial-gradient(50% 120% at 0% 50%,${hexA(H.color, 0.3)},transparent 70%),radial-gradient(50% 120% at 100% 50%,${hexA(A.color, 0.3)},transparent 70%)` }} />
        <div className="mhero-in">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <span className="mstatus" style={isOff ? { background: 'rgba(229,72,77,.18)', color: '#ff6b81' } : isDone ? { background: 'rgba(255,255,255,.1)', color: '#c9d0de' } : { background: '#c6ff3d', color: '#06080d' }}>{isOff ? 'ĐÃ HỦY' : isDone ? 'KẾT THÚC' : 'SẮP DIỄN RA'}</span>
            <span className="minfo">{fDate(m.date)} · {fTime(m.date)} · {m.venue}</span>
            {series && <span className="mstatus" style={{ background: 'rgba(255,255,255,.06)', color: series.active ? '#c6ff3d' : '#8b93a7' }}>{series.active ? `LỊCH CỐ ĐỊNH · ${WDAY[new Date(m.date).getDay()].toUpperCase()} HẰNG TUẦN` : 'LỊCH CỐ ĐỊNH ĐÃ DỪNG'}</span>}
          </div>
          <div className="vs3" style={{ width: '100%', gap: 'clamp(8px,3vw,30px)' }}>
            <div className="mteam"><Crest team={H} /><div>{H.name}</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div className="mscore" style={isOff ? { color: '#ff6b81', fontSize: 'clamp(36px,8vw,72px)' } : undefined}>{isDone ? `${m.hs} - ${m.as}` : isOff ? 'HỦY' : 'VS'}</div>
              {m.status === 'up' && <div className="cd-wide"><Countdown iso={m.date} small /></div>}
            </div>
            <div className="mteam"><Crest team={A} style={{ animationDelay: '.1s' }} /><div>{A.name}</div></div>
          </div>
          {m.status === 'up' && <div className="cd-narrow"><Countdown iso={m.date} small /></div>}
          {isOff && <div className="cancel-why">Lý do hủy: <b>{m.cancelReason || '—'}</b></div>}
          {(canCancel || (isAdmin && series?.active)) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {canCancel && <button className="btn-danger" onClick={() => openModal({ kind: 'cancelMatch', matchId: m.id })}>Hủy trận</button>}
              {isAdmin && series?.active && <button className="btn-cancel" onClick={() => run(() => api.stopSeries(series.id), 'Đã dừng lịch cố định — sẽ không tạo trận tuần sau nữa')}>Dừng lặp lại hằng tuần</button>}
            </div>
          )}
          {isDone && (m.scorers || []).length > 0 && <div className="goals"><div>{goals('home')}</div><div>{goals('away')}</div></div>}
          {isDone && <MomBox m={m} />}
        </div>
      </section>

      <div className="tabs">
        {([['lineup', 'Đội hình'], ['stats', 'Phân tích'], ['vote', 'Dự đoán'], ...(isDone ? [['record', 'Thống kê']] : [])] as [Tab, string][]).map(([k2, l]) => (
          <button key={k2} className={'tab' + (tab === k2 ? ' on' : '')} onClick={() => setTab(k2)}>{l}</button>
        ))}
      </div>

      {tab === 'lineup' && m.status === 'up' && <Rsvp m={m} />}
      {tab === 'record' && <MatchStats m={m} />}
      {tab === 'lineup' && (
        <div className="lineup">
          <div className="pitch-col">
            <div className="pitch-k">{FORMAT_LABEL[fmt].toUpperCase()} · {A.short} {lA.label} · {H.short} {lH.label}{!lH.saved || !lA.saved ? (fromRsvp ? ' · THEO DANH SÁCH ĐĂNG KÝ' : ' · TỰ XẾP') : ''}</div>
            <Pitch>
              {([[lA, A], [lH, H]] as const).flatMap(([l, t], si) => l.toks.map((tk, i) => (
                <Token key={t.id + i} p={tk.p} team={t} x={tk.x} y={tk.y} delay={(si * 7 + i) * 0.04} onClick={tk.p ? () => openCard(tk.p!.id) : undefined} />
              )))}
            </Pitch>
            {(canTeam(H.id) || canTeam(A.id)) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[H, A].filter((t) => canTeam(t.id)).map((t) => <button key={t.id} className="btn-upload" onClick={() => openModal({ kind: 'lineup', teamId: t.id, format: fmt })}>⚙ Xếp đội hình {t.short}</button>)}
              </div>
            )}
          </div>
          <div className="benches">
            {([[H, lH], [A, lA]] as const).map(([t, l]) => (
              <div key={t.id} className="bench">
                <div className="bench-t"><Crest team={t} text={false} /><div>{t.short} · Ra sân</div></div>
                {l.rows.flat().map((p) => li(p))}
                <div className="bench-k">DỰ BỊ</div>
                {l.bench.map((p) => li(p, true))}
              </div>
            ))}
          </div>
        </div>
      )}

      {(tab === 'stats' || tab === 'vote') && !user && <Lock title="Nội dung dành cho thành viên" desc="Đăng nhập để xem phân tích chỉ số, vote đội thắng và dự đoán tỉ số." onLogin={login} />}

      {tab === 'stats' && user && (
        <div className="two">
          <div className="panel g16">
            <div className="box-title">So sánh đội hình ra sân</div>
            {rows.map((r) => (
              <div key={r.l} className="cmp">
                <div className="cmp-l"><b>{r.a}</b><span>{r.l}</span><b>{r.b}</b></div>
                <div className="cmp-bar"><div style={{ width: r.wa, background: r.ca, transformOrigin: 'right' }} /><div style={{ width: r.wb, background: r.cb, transformOrigin: 'left' }} /></div>
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="panel">
              <div className="box-title">Xác suất thắng</div>
              <div className="prob"><span style={{ color: H.color }}>{hp}%</span><span style={{ color: '#9aa3b5', fontSize: 22 }}>Hòa {dp}%</span><span style={{ color: A.color }}>{ap}%</span></div>
              <div className="prob-bar"><div style={{ width: hp + '%', background: H.color }} /><div style={{ width: dp + '%', background: '#4b5366' }} /><div style={{ width: ap + '%', background: A.color }} /></div>
              <div className="note">Dựa trên chỉ số trung bình của đội hình ra sân.</div>
            </div>
            <div className="panel">
              <div className="box-title">Phong độ 5 trận</div>
              {[H, A].map((t) => (
                <div key={t.id} className="form-row">
                  <span>{t.name}</span>
                  <div>{record(done, t.id).form.map((f, j) => <span key={j} className="form-chip lg" style={{ background: f.bg }}>{f.l}</span>)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'vote' && user && (
        <div className="two">
          <div className="panel">
            <div className="row-sb" style={{ alignItems: 'baseline' }}><div className="box-title">Vote đội thắng</div><span className="note" style={{ lineHeight: 1 }}>{v.home + v.draw + v.away} lượt</span></div>
            {([['home', H.short + ' thắng', H.color], ['draw', 'Hòa', '#9aa3b5'], ['away', A.short + ' thắng', A.color]] as [WinnerKey, string, string][]).map(([key, l, c]) => {
              const pct = Math.round((v[key] / vt) * 100);
              const sel = my.winner === key || actual === key;
              return (
                <button key={key} className="vote" disabled={voted} style={{ borderColor: sel ? c : undefined }}
                  onClick={() => run(() => api.voteWinner(m.id, key), 'Đã ghi nhận vote của bạn!')}>
                  <div className="vote-fill" style={{ width: voted ? pct + '%' : '0%', background: hexA(c, 0.22) }} />
                  <span className="vote-l">{l}{my.winner === key ? ' · bạn chọn' : ''}</span>
                  <span className="vote-p">{voted ? pct + '%' : ''}</span>
                </button>
              );
            })}
            <div className="note" style={{ color: '#aab2c5' }}>
              {actual ? `Kết quả thực tế: ${actual === 'draw' ? 'Hòa' : tm(actual === 'home' ? m.home : m.away).short + ' thắng'} · ${acc}% người vote đoán đúng.`
                : isOff ? 'Trận đã bị hủy — vote đã đóng.'
                : !canVote ? 'Tài khoản đang chờ Ban tổ chức duyệt — bạn xem được kết quả vote nhưng chưa thể vote.'
                : my.winner ? 'Cảm ơn bạn đã vote! Kết quả sẽ chốt khi trận đấu kết thúc.' : 'Chọn đội bạn tin sẽ thắng. Mỗi người 1 lượt vote.'}
            </div>
          </div>
          <div className="panel g16">
            <div className="box-title">Dự đoán tỉ số</div>
            {m.status === 'up' && !my.score && canVote && (
              <>
                <div className="pred">
                  <div className="pred-side"><span style={{ color: H.color }}>{H.short}</span><div className="stepper"><button onClick={step(setVs, 'h', -1, 15)}>−</button><b>{vs.h}</b><button onClick={step(setVs, 'h', 1, 15)}>+</button></div></div>
                  <span className="pred-colon">:</span>
                  <div className="pred-side"><span style={{ color: A.color }}>{A.short}</span><div className="stepper"><button onClick={step(setVs, 'a', -1, 15)}>−</button><b>{vs.a}</b><button onClick={step(setVs, 'a', 1, 15)}>+</button></div></div>
                </div>
                <button className="btn-lime lg" style={{ padding: 13 }} onClick={() => {
                  const key = `${vs.h}-${vs.a}`;
                  run(() => api.voteScore(m.id, key), 'Đã gửi dự đoán ' + key.replace('-', ' – '));
                }}>Gửi dự đoán</button>
              </>
            )}
            {my.score && <div className="mine">Dự đoán của bạn: {`${H.short} ${my.score.replace('-', ' – ')} ${A.short}`}</div>}
            <div className="k10">TỈ SỐ ĐƯỢC CHỌN NHIỀU NHẤT</div>
            {sv.map(([sc, n]) => {
              const c = (isDone && sc === ak) || my.score === sc ? '#c6ff3d' : '#7c86a0';
              return <div key={sc} className="top-sc"><span style={{ color: c }}>{sc}</span><div><div style={{ width: (n / mx) * 100 + '%', background: c }} /></div><span>{n}</span></div>;
            })}
            {!sv.length && <div className="note">Chưa có dự đoán nào.</div>}
          </div>
          {isAdmin && !isOff && <ResultPanel key={m.id + m.status} m={m} />}
        </div>
      )}
    </div>
  );
}

/** Admin: enter or correct the score, pick scorers, or delete the match. */
function ResultPanel({ m }: { m: Match }) {
  const { snap, run, go } = useLeague();
  const { tm } = useAccess();
  const H = tm(m.home), A = tm(m.away);
  const isDone = m.status === 'done';
  const [res, setRes] = useState({ h: isDone ? m.hs : 0, a: isDone ? m.as : 0 });
  // One scorer slot per goal: { pid, min } ('' = not recorded).
  const init = (side: 'home' | 'away', n: number) => {
    const g = (m.scorers || []).filter((x) => x.side === side);
    return Array.from({ length: n }, (_, i) => ({ pid: g[i]?.pid || '', min: g[i]?.min != null ? String(g[i].min) : '' }));
  };
  const [goals, setGoals] = useState({ home: init('home', res.h), away: init('away', res.a) });
  const [confirmDel, setConfirmDel] = useState(false);
  const setScore = (key: 'h' | 'a', dl: number) => () => {
    const side = key === 'h' ? 'home' : 'away';
    const n = clamp(res[key] + dl, 0, 20);
    setRes({ ...res, [key]: n });
    setGoals((g) => ({ ...g, [side]: Array.from({ length: n }, (_, i) => g[side][i] || { pid: '', min: '' }) }));
  };
  const squad = (tid: string) => squadOf(snap!.players, tid).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const scorers = (): Goal[] => (['home', 'away'] as const).flatMap((side) => goals[side]
    .filter((g) => g.pid)
    .map((g) => ({ pid: g.pid, side, ...(g.min !== '' && !isNaN(+g.min) ? { min: clamp(Math.round(+g.min), 1, 130) } : {}) } as Goal)))
    .sort((x, y) => (x.min ?? 999) - (y.min ?? 999));
  const col = (side: 'home' | 'away', tid: string) => goals[side].map((g, i) => (
    <div key={i} className="goal-row">
      <select className="inp" value={g.pid} aria-label={`Bàn ${i + 1}`} onChange={(e) => setGoals({ ...goals, [side]: goals[side].map((x, j) => (j === i ? { ...x, pid: e.target.value } : x)) })}>
        <option value="">⚽ Bàn {i + 1} · chưa rõ</option>
        {squad(tid).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input className="inp" inputMode="numeric" placeholder="phút" value={g.min} aria-label="Phút"
        onChange={(e) => setGoals({ ...goals, [side]: goals[side].map((x, j) => (j === i ? { ...x, min: e.target.value.replace(/\D/g, '').slice(0, 3) } : x)) })} />
    </div>
  ));
  return (
    <div className="result">
      <div className="result-t">Ban tổ chức · {isDone ? 'Sửa kết quả' : 'Nhập kết quả'}</div>
      <div className="result-s">
        <button onClick={setScore('h', -1)} aria-label="Giảm">−</button><b>{res.h}</b><button onClick={setScore('h', 1)} aria-label="Tăng">+</button>
        <i>–</i>
        <button onClick={setScore('a', -1)} aria-label="Giảm">−</button><b>{res.a}</b><button onClick={setScore('a', 1)} aria-label="Tăng">+</button>
      </div>
      {res.h + res.a > 0 && (
        <div className="goals-edit">
          <div><div className="k10" style={{ color: H.color }}>{H.short} · GHI BÀN</div>{col('home', H.id)}</div>
          <div><div className="k10" style={{ color: A.color }}>{A.short} · GHI BÀN</div>{col('away', A.id)}</div>
        </div>
      )}
      <button className="btn-gold-o" onClick={() => run(() => api.saveResult(m.id, res.h, res.a, scorers()), `${isDone ? 'Đã cập nhật' : 'Kết thúc'}: ${H.short} ${res.h} – ${res.a} ${A.short}`)}>
        {isDone ? 'Lưu kết quả' : 'Kết thúc trận & lưu'}
      </button>
      <button className={'btn-danger' + (confirmDel ? ' on' : '')} style={{ alignSelf: 'flex-start' }} onClick={() => {
        if (!confirmDel) return setConfirmDel(true);
        run(() => api.deleteMatch(m.id), 'Đã xóa trận đấu').then((ok) => ok && go({ view: 'matches' }));
      }}>{confirmDel ? 'Xác nhận xóa trận (mất cả vote)' : 'Xóa trận đấu'}</button>
    </div>
  );
}

/** Man of the Match: shown after the match; the admin or either team's chairman picks it. */
function MomBox({ m }: { m: Match }) {
  const { snap, openCard } = useLeague();
  const { tm, isAdmin, myT } = useAccess();
  const { act, busy } = useAction(1500);
  const [pick, setPick] = useState(false);
  const d = snap!;
  const can = isAdmin || (!!myT && (myT === m.home || myT === m.away));
  const mom = m.mom ? d.players.find((p) => p.id === m.mom) : undefined;
  if (!mom && !can) return null;
  // Candidates: registered players, else both squads. Sorted by goals in this match, then approved rating.
  const reg = participantsOf(d.participants, m.id);
  const ids = reg.length ? new Set(reg.map((r) => r.playerId)) : null;
  const goalsOf = (pid: string) => Math.max(m.scorers.filter((g) => g.pid === pid).length, reg.find((r) => r.playerId === pid && r.status === 'approved')?.goals ?? 0);
  const ratingOf = (pid: string) => reg.find((r) => r.playerId === pid && r.status === 'approved')?.rating ?? 0;
  const cands = d.players.filter((p) => (ids ? ids.has(p.id) : p.teamId === m.home || p.teamId === m.away))
    .sort((a, b) => goalsOf(b.id) - goalsOf(a.id) || ratingOf(b.id) - ratingOf(a.id) || b.ovr - a.ovr);
  const choose = (pid: string | null) => act('mom', () => api.setMom(m.id, pid), pid ? 'Đã chọn MOM: ' + d.players.find((p) => p.id === pid)?.name : 'Đã bỏ chọn MOM').then(() => setPick(false));
  return (
    <div className="mom">
      {mom ? (
        <button className="mom-card" onClick={() => openCard(mom.id)}>
          <span className="mom-ring"><FameAvatar p={mom} team={tm(mom.teamId)} size={64} /></span>
          <span className="mom-txt"><small>⭐ CẦU THỦ XUẤT SẮC TRẬN</small><b>{mom.name}</b><em>{tm(mom.teamId).name}</em></span>
        </button>
      ) : <div className="note">Chưa chọn cầu thủ xuất sắc trận (MOM).</div>}
      {can && !pick && <button className="btn-upload" onClick={() => setPick(true)}>{mom ? 'Đổi MOM' : '⭐ Chọn MOM'}</button>}
      {can && pick && (
        <div className="mom-pick">
          {cands.slice(0, 16).map((p) => (
            <button key={p.id} className={'mom-opt' + (p.id === m.mom ? ' on' : '')} disabled={busy} onClick={() => choose(p.id)}>
              <FameAvatar p={p} team={tm(p.teamId)} size={28} /><span>{p.name}</span>{goalsOf(p.id) > 0 && <em>⚽{goalsOf(p.id)}</em>}
            </button>
          ))}
          {!cands.length && <div className="note">Chưa có cầu thủ nào tham gia trận này.</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            {m.mom && <button className="btn-upload" disabled={busy} onClick={() => choose(null)}>Bỏ chọn</button>}
            <button className="btn-upload" onClick={() => setPick(false)}>{busy ? <Spin /> : 'Đóng'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
