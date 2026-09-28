import { Crest, OvrBadge, PlayerCard, SecTitle, Trend } from '../components/bits';
import { hrefOf, useAccess, useLeague } from '../data/store';
import { crestBg, fDate, fTime, hexA, money, record, sortedMatches, valueTrend } from '../lib/league';
import type { Match, Team } from '../lib/types';
import { Countdown } from './Matches';
import { TournamentBanner } from './Tournament';

export function ResultRow({ m, i, H, A }: { m: Match; i: number; H: Team; A: Team }) {
  const { go } = useLeague();
  return (
    <a href={hrefOf({ view: 'match', matchId: m.id })} className="res" style={{ animationDelay: (i * 0.06).toFixed(2) + 's' }}
      onClick={(e) => { e.preventDefault(); go({ view: 'match', matchId: m.id }); }}>
      <div className="res-side h" style={{ opacity: m.hs < m.as ? 0.45 : 1 }}><span>{H.short}</span><Crest team={H} text={false} /></div>
      <div className="res-mid"><b>{m.hs} - {m.as}</b><span>{fDate(m.date)}</span></div>
      <div className="res-side" style={{ opacity: m.as < m.hs ? 0.45 : 1 }}><Crest team={A} text={false} /><span>{A.short}</span></div>
    </a>
  );
}

export function Home() {
  const { snap, go, openCard, openModal } = useLeague();
  const { tm, isAdmin } = useAccess();
  const d = snap!;
  const T = d.teams;
  const { done, ups } = sortedMatches(d.matches);

  // Head-to-head between the first two teams (F8 vs F9).
  if (!T.length) return <div className="view"><div className="empty">Giải đấu chưa có đội nào. Ban tổ chức tạo đội trong mục Quản lý.</div></div>;
  const A0 = T[0], B0 = T[1] || T[0];
  let wa = 0, dw = 0, wb = 0, ga = 0, gb = 0;
  done.filter((m) => [m.home, m.away].includes(A0.id) && [m.home, m.away].includes(B0.id)).forEach((m) => {
    const a = m.home === A0.id ? m.hs : m.as, b = m.home === A0.id ? m.as : m.hs;
    ga += a; gb += b;
    if (a > b) wa++; else if (a < b) wb++; else dw++;
  });
  const tot = wa + dw + wb || 1;
  const next = ups[0];
  const standings = T.map((t) => ({ t, r: record(done, t.id) })).sort((x, y) => y.r.pts - x.r.pts || y.r.gd - x.r.gd || y.r.gf - x.r.gf);
  const stars = d.players.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 7);
  const risers = d.players.map((p) => ({ p, pct: valueTrend(d.valueHistory[p.id], p.value) }))
    .filter((x): x is { p: typeof x.p; pct: number } => x.pct != null && x.pct >= 1).sort((a, b) => b.pct - a.pct).slice(0, 4);
  const glow = (t: Team) => hexA(t.color, 0.3);
  // Featured tournament: ongoing first, then the nearest upcoming, else the latest finished.
  const rank = { ongoing: 0, upcoming: 1, finished: 2 } as const;
  const featured = d.tournaments.slice().sort((a, b) => rank[a.status] - rank[b.status] || (b.startsOn || '').localeCompare(a.startsOn || ''))[0];
  const others = d.tournaments.filter((x) => x.id !== featured?.id).slice(0, 4);

  return (
    <div className="view">
      {featured && <TournamentBanner t={featured} onOpen={() => go({ view: 'tournament', id: featured.id })} />}
      {(isAdmin || others.length > 0) && (
        <div className="row-sb wrap" style={{ marginTop: featured ? -8 : 0 }}>
          <div className="t-chips">{others.map((x) => <a key={x.id} className="pill" href={hrefOf({ view: 'tournament', id: x.id })} onClick={(e) => { e.preventDefault(); go({ view: 'tournament', id: x.id }); }}>🏆 {x.name}</a>)}</div>
          {isAdmin && <button className="btn-gold" onClick={() => openModal({ kind: 'tournament' })}>+ Tạo giải đấu</button>}
        </div>
      )}
      <section className="hero">
        <div className="hero-glow" style={{ background: `radial-gradient(55% 100% at 0% 50%,${glow(A0)},transparent 70%),radial-gradient(55% 100% at 100% 50%,${glow(B0)},transparent 70%)` }} />
        <div className="hero-hatch" />
        <div className="hero-in">
          <div className="hero-tag">LỊCH SỬ ĐỐI ĐẦU</div>
          <div className="vs3" style={{ gap: 'clamp(8px,3vw,32px)' }}>
            <div className="hero-team" style={{ animation: 'slideIn .7s ease both' }}>
              <Crest team={A0} />
              <div className="hero-team-name">{A0.name}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div className="h2h-nums">
                <div><span style={{ color: A0.color }}>{wa}</span><small>THẮNG</small></div>
                <div><span style={{ color: '#9aa3b5', fontSize: '.6em' }}>{dw}</span><small>HÒA</small></div>
                <div><span style={{ color: B0.color }}>{wb}</span><small>THẮNG</small></div>
              </div>
              <div className="h2h-sub">{wa + dw + wb} trận · Bàn thắng {ga} – {gb}</div>
            </div>
            <div className="hero-team" style={{ animation: 'viewIn .7s ease both' }}>
              <Crest team={B0} style={{ animationDelay: '2s' }} />
              <div className="hero-team-name">{B0.name}</div>
            </div>
          </div>
          <div className="h2h-bar">
            <div style={{ width: (wa / tot) * 100 + '%', background: A0.color, transformOrigin: 'left', animation: 'grow 1s .2s ease both' }} />
            <div style={{ width: (dw / tot) * 100 + '%', background: '#4b5366', animation: 'fadeIn 1s .5s both' }} />
            <div style={{ width: (wb / tot) * 100 + '%', background: B0.color, transformOrigin: 'right', animation: 'grow 1s .2s ease both' }} />
          </div>
          {next && (
            <div className="next">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="live"><i />TRẬN TIẾP THEO</div>
                <div style={{ font: "italic 800 24px/1 'Barlow Condensed',sans-serif", color: '#fff' }}>{tm(next.home).short} vs {tm(next.away).short}</div>
                <div style={{ font: "500 13px/1.3 'Be Vietnam Pro',sans-serif", color: '#aab2c5' }}>{fDate(next.date)} · {fTime(next.date)} · {next.venue}</div>
              </div>
              <Countdown iso={next.date} />
              <button className="btn-cta" onClick={() => go({ view: 'match', matchId: next.id })}>Đội hình &amp; Dự đoán →</button>
            </div>
          )}
        </div>
      </section>

      <div className="grid2">
        <section className="panel">
          <div className="row-sb">
            <SecTitle>Kết quả gần đây</SecTitle>
            <a className="more" href={hrefOf({ view: 'matches' })} onClick={(e) => { e.preventDefault(); go({ view: 'matches' }); }}>Xem tất cả →</a>
          </div>
          {done.slice().reverse().slice(0, 5).map((m, i) => <ResultRow key={m.id} m={m} i={i} H={tm(m.home)} A={tm(m.away)} />)}
          {!done.length && <div className="none">Chưa có trận nào kết thúc.</div>}
        </section>
        <section className="panel">
          <SecTitle>Bảng xếp hạng</SecTitle>
          <div style={{ overflowX: 'auto' }}>
            <div className="tbl">
              <div className="tbl-row tbl-head"><span>#</span><span>ĐỘI</span><span>TR</span><span>T</span><span>H</span><span>B</span><span>HS</span><span>Đ</span><span>PHONG ĐỘ</span></div>
              {standings.map(({ t, r }, i) => (
                <a key={t.id} href={hrefOf({ view: 'teams', teamId: t.id })} className="tbl-row tbl-body" style={{ animationDelay: i * 0.08 + 's' }}
                  onClick={(e) => { e.preventDefault(); go({ view: 'teams', teamId: t.id }); }}>
                  <span className="tbl-rank">{i + 1}</span>
                  <div className="tbl-team"><div className="crest" style={{ background: crestBg(t) }} /><span>{t.name}</span></div>
                  <span>{r.p}</span><span>{r.w}</span><span>{r.d}</span><span>{r.l}</span><span>{(r.gd > 0 ? '+' : '') + r.gd}</span>
                  <span className="tbl-pts">{r.pts}</span>
                  <div style={{ display: 'flex', gap: 3 }}>{r.form.map((f, j) => <span key={j} className="form-chip" style={{ background: f.bg }}>{f.l}</span>)}</div>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      {risers.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SecTitle color="#4ade80">Tăng giá mạnh nhất tuần</SecTitle>
          <div className="risers">
            {risers.map(({ p, pct }) => (
              <div key={p.id} className="riser" role="button" tabIndex={0} onClick={() => openCard(p.id)} onKeyDown={(e) => { if (e.key === 'Enter') openCard(p.id); }}>
                <OvrBadge p={p} className="rq-badge" />
                <div><span>{p.name}</span><span className="mk-val" style={{ fontSize: 16 }}>{money(p.value)}<Trend pct={pct} /></span></div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row-sb">
          <SecTitle color="#f5c542">Ngôi sao giải đấu</SecTitle>
          <a className="more" href={hrefOf({ view: 'market' })} onClick={(e) => { e.preventDefault(); go({ view: 'market' }); }}>Thị trường →</a>
        </div>
        <div className="card-strip">
          {stars.map((p, i) => <PlayerCard key={p.id} p={p} team={tm(p.teamId)} delay={i * 0.05} onClick={() => openCard(p.id)} />)}
          {!stars.length && <div className="none" style={{ flex: 1 }}>Chưa có cầu thủ nào. Chủ tịch / BHL thêm cầu thủ trong mục Quản lý.</div>}
        </div>
      </section>
    </div>
  );
}
