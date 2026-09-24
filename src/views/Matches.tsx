import { useState } from 'react';
import { Crest, Lock } from '../components/bits';
import { api, findMatch, hrefOf, squadOf, useAccess, useLeague, useNow } from '../data/store';
import { clamp, fDate, fTime, FORMATION, hexA, lineup, record, sortedMatches } from '../lib/league';
import type { Match, Player, WinnerKey } from '../lib/types';

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
  const { done, ups } = sortedMatches(snap!.matches);
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
        {done.slice().reverse().map((m, i) => {
          const H = tm(m.home), A = tm(m.away);
          return (
            <a key={m.id} className="tl-item" {...link(m)} style={{ animationDelay: (i * 0.06).toFixed(2) + 's' }}>
              <div className="tl-dot" />
              <div className="tl-side h" style={{ opacity: m.hs < m.as ? 0.45 : 1 }}><span>{H.name}</span><Crest team={H} text={false} /></div>
              <div className="tl-mid"><b>{m.hs} - {m.as}</b><span>{fDate(m.date)}</span></div>
              <div className="tl-side" style={{ opacity: m.as < m.hs ? 0.45 : 1 }}><Crest team={A} text={false} /><span>{A.name}</span></div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

type Tab = 'lineup' | 'stats' | 'vote';

export function MatchDetail({ matchId }: { matchId: string }) {
  const { snap, go, openCard, openModal, user, run } = useLeague();
  const { tm, isAdmin } = useAccess();
  const [tab, setTab] = useState<Tab>('lineup');
  const [vs, setVs] = useState({ h: 1, a: 1 });
  const [res, setRes] = useState({ h: 0, a: 0 });
  const d = snap!;
  const m = findMatch(d.matches, matchId);
  if (!m) return <div className="view"><a className="back" onClick={() => go({ view: 'matches' })}>← Lịch thi đấu</a><div className="none">Không tìm thấy trận đấu.</div></div>;

  const H = tm(m.home), A = tm(m.away);
  const isDone = m.status === 'done';
  const { done } = sortedMatches(d.matches);
  const lH = lineup(squadOf(d.players, H.id)), lA = lineup(squadOf(d.players, A.id));
  const Y = [93, 80, 68, 56];
  let k = 0;
  const tokens: { p: Player; x: string; y: string; color: string; delay: string }[] = [];
  ([[lH, H.color, false], [lA, A.color, true]] as const).forEach(([l, color, flip]) => l.rows.forEach((row, ri) => row.forEach((p, i) => {
    tokens.push({ p, x: ((i + 1) / (row.length + 1)) * 100 + '%', y: (flip ? 100 - Y[ri] : Y[ri]) + '%', color, delay: (k++ * 0.05).toFixed(2) + 's' });
  })));

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
  const voted = !!my.winner || isDone;
  const actual: WinnerKey | null = isDone ? (m.hs > m.as ? 'home' : m.hs < m.as ? 'away' : 'draw') : null;
  const ak = `${m.hs}-${m.as}`;
  const sv = Object.entries(m.sv || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const mx = sv.length ? sv[0][1] : 1;
  const acc = actual ? Math.round((v[actual] / vt) * 100) : 0;
  const pn = (id: string) => { const p = d.players.find((x) => x.id === id); return p ? p.name.split(' ').slice(-2).join(' ') : '?'; };
  const goals = (side: 'home' | 'away') => (m.scorers || []).filter((g) => g.side === side).map((g, i) => <span key={i}>⚽ {pn(g.pid)} {g.min}'</span>);
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
            <span className="mstatus" style={isDone ? { background: 'rgba(255,255,255,.1)', color: '#c9d0de' } : { background: '#c6ff3d', color: '#06080d' }}>{isDone ? 'KẾT THÚC' : 'SẮP DIỄN RA'}</span>
            <span className="minfo">{fDate(m.date)} · {fTime(m.date)} · {m.venue}</span>
          </div>
          <div className="vs3" style={{ width: '100%', gap: 'clamp(8px,3vw,30px)' }}>
            <div className="mteam"><Crest team={H} /><div>{H.name}</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div className="mscore">{isDone ? `${m.hs} - ${m.as}` : 'VS'}</div>
              {!isDone && <div className="cd-wide"><Countdown iso={m.date} small /></div>}
            </div>
            <div className="mteam"><Crest team={A} style={{ animationDelay: '.1s' }} /><div>{A.name}</div></div>
          </div>
          {!isDone && <div className="cd-narrow"><Countdown iso={m.date} small /></div>}
          {isDone && (m.scorers || []).length > 0 && <div className="goals"><div>{goals('home')}</div><div>{goals('away')}</div></div>}
        </div>
      </section>

      <div className="tabs">
        {([['lineup', 'Đội hình'], ['stats', 'Phân tích'], ['vote', 'Dự đoán']] as [Tab, string][]).map(([k2, l]) => (
          <button key={k2} className={'tab' + (tab === k2 ? ' on' : '')} onClick={() => setTab(k2)}>{l}</button>
        ))}
      </div>

      {tab === 'lineup' && (
        <div className="lineup">
          <div className="pitch-col">
            <div className="pitch-k">SƠ ĐỒ SÂN 7 · {FORMATION}</div>
            <div className="pitch">
              <i className="mid" /><i className="circ" /><i className="box-t" /><i className="box-b" /><i className="six-t" /><i className="six-b" />
              {tokens.map((t) => (
                <button key={t.p.id} className="tok" style={{ left: t.x, top: t.y }} onClick={() => openCard(t.p.id)}>
                  <div className="tok-in" style={{ animationDelay: t.delay }}>
                    <div className="tok-ovr" style={{ background: t.color }}>{t.p.ovr}</div>
                    <div className="tok-name">{t.p.name.split(' ').pop()}</div>
                  </div>
                </button>
              ))}
            </div>
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

      {tab !== 'lineup' && !user && <Lock title="Nội dung dành cho thành viên" desc="Đăng nhập để xem phân tích chỉ số, vote đội thắng và dự đoán tỉ số." onLogin={login} />}

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
                : my.winner ? 'Cảm ơn bạn đã vote! Kết quả sẽ chốt khi trận đấu kết thúc.' : 'Chọn đội bạn tin sẽ thắng. Mỗi người 1 lượt vote.'}
            </div>
          </div>
          <div className="panel g16">
            <div className="box-title">Dự đoán tỉ số</div>
            {!isDone && !my.score && (
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
          {!isDone && isAdmin && (
            <div className="result">
              <div className="result-t">Ban tổ chức · Nhập kết quả</div>
              <div className="result-s">
                <button onClick={step(setRes, 'h', -1, 20)}>−</button><b>{res.h}</b><button onClick={step(setRes, 'h', 1, 20)}>+</button>
                <i>–</i>
                <button onClick={step(setRes, 'a', -1, 20)}>−</button><b>{res.a}</b><button onClick={step(setRes, 'a', 1, 20)}>+</button>
              </div>
              <button className="btn-gold-o" onClick={() => run(() => api.finishMatch(m.id, res.h, res.a), `Kết thúc: ${H.short} ${res.h} – ${res.a} ${A.short}`)}>Kết thúc trận &amp; lưu</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
