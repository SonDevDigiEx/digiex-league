import { useEffect, useState } from 'react';
import { Crest } from '../components/bits';
import { useAccess, useLeague } from '../data/store';
import { currentPeriod, periodKey, periodLabel, ranks, shiftPeriod, topMom, topScorers, type Leader, type Period, type PeriodKind } from '../lib/fame';
import { ini } from '../lib/league';
import type { Player, Team } from '../lib/types';

/** Animated number (eases up from 0 whenever the value or period changes). */
function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const f = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{v}</>;
}

/** Round player photo, or initials on the team colours. */
export function FameAvatar({ p, team, size }: { p: Player; team: Team; size: number }) {
  const { snap } = useLeague();
  // Player photo, else the account's Google avatar.
  const src = p.photo || (p.userId ? snap?.members.find((m) => m.id === p.userId)?.avatar : null) || null;
  return (
    <div className="fa" style={{ width: size, height: size, fontSize: size * 0.34, background: src ? `center/cover no-repeat url("${src}")` : `linear-gradient(135deg, ${team.color}, ${team.color2})` }}>
      {src ? '' : ini(p.name)}
    </div>
  );
}

const MEDAL = ['#f5c542', '#d7dde8', '#e0995e'];

function Podium({ list, unit, icon }: { list: Leader[]; unit: string; icon: string }) {
  const { snap, openCard } = useLeague();
  const { tm } = useAccess();
  const rk = ranks(list);
  const top = list.slice(0, 3).map((l, i) => ({ l, r: rk[i], p: snap!.players.find((x) => x.id === l.playerId) })).filter((x) => x.p);
  // Visual order: 2 – 1 – 3
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="podium">
      {order.map(({ l, r, p }) => {
        const first = top[0].l === l;
        const place = first ? 1 : top[1]?.l === l ? 2 : 3;
        const team = tm(p!.teamId);
        return (
          <button key={l.playerId} className={'pd pd-' + place} onClick={() => openCard(p!.id)} style={{ ['--m' as string]: MEDAL[place - 1] }}>
            {first && <><div className="pd-beam l" /><div className="pd-beam r" /><div className="pd-crown">👑</div></>}
            <div className="pd-ring"><FameAvatar p={p!} team={team} size={first ? 132 : 96} /></div>
            <div className="pd-rank">{r}</div>
            <div className="pd-name">{p!.name}</div>
            <div className="pd-team"><Crest team={team} text={false} /><span>{team.short}</span></div>
            <div className="pd-val"><b><CountUp to={l.value} /></b><span>{icon} {unit}</span></div>
            <div className="pd-block"><span>{place}</span></div>
          </button>
        );
      })}
    </div>
  );
}

function Board({ title, sub, list, unit, icon, empty, color }: { title: string; sub: string; list: Leader[]; unit: string; icon: string; empty: string; color: string }) {
  const { snap, openCard } = useLeague();
  const { tm } = useAccess();
  const rk = ranks(list);
  const rest = list.slice(3, 10);
  return (
    <section className="board" style={{ ['--c' as string]: color }}>
      <div className="board-h"><span className="board-ic">{icon}</span><div><h2>{title}</h2><span>{sub}</span></div></div>
      {!list.length ? <div className="board-empty"><span>{icon}</span>{empty}</div> : (
        <>
          <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ left: (i * 37) % 100 + '%', animationDelay: (i % 9) * 0.45 + 's', animationDuration: 3.6 + (i % 5) * 0.5 + 's' }} />)}</div>
          <Podium list={list} unit={unit} icon={icon} />
          {rest.length > 0 && (
            <div className="board-list">
              {rest.map((l, i) => {
                const p = snap!.players.find((x) => x.id === l.playerId);
                if (!p) return null;
                const team = tm(p.teamId);
                return (
                  <button key={l.playerId} className="bl-row" style={{ animationDelay: 0.6 + i * 0.07 + 's' }} onClick={() => openCard(p.id)}>
                    <span className="bl-rank">{rk[i + 3]}</span>
                    <FameAvatar p={p} team={team} size={40} />
                    <span className="bl-name">{p.name}<small>{team.name}</small></span>
                    <b>{l.value}</b>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const KINDS: [PeriodKind, string][] = [['month', 'Tháng'], ['quarter', 'Quý'], ['year', 'Năm'], ['all', 'Tất cả']];

export function Fame() {
  const { snap } = useLeague();
  const d = snap!;
  const [p, setP] = useState<Period>(() => currentPeriod('month'));
  const now = currentPeriod(p.kind);
  const atNow = p.kind === 'all' || (p.year === now.year && p.n === now.n);
  const scorers = topScorers(d.matches, d.participants, p);
  const moms = topMom(d.matches, p);
  return (
    <div className="view fame">
      <section className="fame-hero">
        <div className="fame-rays" /><div className="fame-glow" />
        <div className="fame-k">ĐẠI SẢNH DANH VỌNG</div>
        <h1 className="fame-t">VINH DANH</h1>
        <div className="fame-tabs">{KINDS.map(([k, l]) => <button key={k} className={p.kind === k ? 'on' : ''} onClick={() => setP(currentPeriod(k))}>{l}</button>)}</div>
        <div className="fame-nav">
          {p.kind !== 'all' && <button aria-label="Kỳ trước" onClick={() => setP(shiftPeriod(p, -1))}>‹</button>}
          <b key={periodKey(p)}>{periodLabel(p)}</b>
          {p.kind !== 'all' && <button aria-label="Kỳ sau" disabled={atNow} onClick={() => setP(shiftPeriod(p, 1))}>›</button>}
        </div>
      </section>
      <div className="fame-grid" key={periodKey(p)}>
        <Board title="Vua phá lưới" sub={periodLabel(p)} list={scorers} unit="bàn" icon="⚽" color="#f5c542" empty="Chưa có bàn thắng nào trong kỳ này." />
        <Board title="Cầu thủ xuất sắc trận" sub={'Số lần MOM · ' + periodLabel(p)} list={moms} unit="MOM" icon="⭐" color="#c6ff3d" empty="Chưa có MOM nào. Chủ tịch hoặc BTC chọn MOM ở trang trận đấu sau khi trận kết thúc." />
      </div>
      <div className="note" style={{ textAlign: 'center' }}>Bàn thắng lấy từ danh sách ghi bàn của BTC và thống kê cá nhân đã được BHL duyệt (mỗi trận tính theo số lớn hơn, không cộng trùng).</div>
    </div>
  );
}
