import { useEffect, useState } from 'react';
import { PlayerCard, SecTitle } from '../components/bits';
import { useAccess, useLeague } from '../data/store';
import { fmtRank, MIN_RATED, playerRanking, RANK_COLS, sortRanking, type RankKey, type RankRow } from '../lib/ranking';
import { FameAvatar } from './Fame';

const MEDAL = ['#f5c542', '#d7dde8', '#e0995e'];
const hasValue = (r: RankRow, k: RankKey) => (k === 'stability' ? r.stability != null : k === 'growth' ? r.growth > 0 || (r.player.xp ?? 0) > 0 : r[k] > 0);
const ovrUp = (r: RankRow) => (r.ovrUp > 0 ? `OVR +${r.ovrUp}` : null);

/** Auto-rotating spotlight of the top 3 for the chosen metric. */
function Spotlight({ top, k }: { top: RankRow[]; k: RankKey }) {
  const { openCard } = useLeague();
  const { tm } = useAccess();
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const n = top.length;
  useEffect(() => setI(0), [k, n]);
  useEffect(() => {
    if (hold || n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 4500);
    return () => clearInterval(t);
  }, [hold, n]);
  if (!n) return <div className="spot empty"><span>🏅</span>Chưa có số liệu cho chỉ tiêu này.</div>;
  const r = top[Math.min(i, n - 1)];
  const col = RANK_COLS.find((c) => c.key === k)!;
  const team = tm(r.player.teamId);
  const place = Math.min(i, n - 1) + 1;
  return (
    <div className="spot" style={{ ['--m' as string]: MEDAL[place - 1], ['--tc' as string]: team.color }}
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="spot-rays" /><div className="spot-glow" />
      <div className="spot-in" key={r.player.id + k}>
        <div className="spot-card" onClick={() => openCard(r.player.id)}><PlayerCard p={r.player} team={team} still /></div>
        <div className="spot-txt">
          <div className="spot-place"><b>TOP {place}</b><span>{col.icon} {col.label.toUpperCase()}</span></div>
          <div className="spot-name">{r.player.name}</div>
          <div className="spot-team"><i style={{ background: team.color }} />{team.name} · {r.player.positions.join(' / ')}</div>
          <div className="spot-val"><b>{fmtRank(r, k)}</b><span>{col.unit}</span>{k === 'growth' && ovrUp(r) && <em className="spot-up">{ovrUp(r)}</em>}</div>
          <div className="spot-mini">
            <div><b>{r.apps}</b><span>Trận</span></div>
            {RANK_COLS.filter((c) => c.key !== k).map((c) => <div key={c.key}><b>{fmtRank(r, c.key)}</b><span>{c.label}</span></div>)}
          </div>
        </div>
      </div>
      {n > 1 && (
        <div className="spot-nav">
          <button aria-label="Trước" onClick={() => setI((x) => (x - 1 + n) % n)}>‹</button>
          {top.map((t, j) => <button key={t.player.id} className={'dot' + (j === Math.min(i, n - 1) ? ' on' : '')} aria-label={'Top ' + (j + 1)} onClick={() => setI(j)}><i style={{ animationDuration: hold ? '0s' : '4.5s' }} /></button>)}
          <button aria-label="Sau" onClick={() => setI((x) => (x + 1) % n)}>›</button>
        </div>
      )}
    </div>
  );
}

export function PlayerRanking() {
  const { snap, openCard } = useLeague();
  const { tm } = useAccess();
  const d = snap!;
  const [k, setK] = useState<RankKey>('goals');
  const [team, setTeam] = useState<string>('all');
  const rows = playerRanking(d.players, d.matches, d.participants).filter((r) => team === 'all' || r.player.teamId === team);
  if (!d.players.some((p) => p.teamId)) return null;
  const sorted = sortRanking(rows, k);
  const top = sorted.filter((r) => hasValue(r, k)).slice(0, 3);
  const shown = sorted;
  const col = RANK_COLS.find((c) => c.key === k)!;
  return (
    <section className="rank" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row-sb wrap">
        <SecTitle color="#c6ff3d">Bảng xếp hạng cầu thủ</SecTitle>
        <div className="chips">
          <button className={'chip' + (team === 'all' ? ' on' : '')} onClick={() => setTeam('all')}>Tất cả đội</button>
          {d.teams.map((t) => <button key={t.id} className={'chip' + (team === t.id ? ' on' : '')} onClick={() => setTeam(t.id)}>{t.short}</button>)}
        </div>
      </div>
      <div className="rank-sort" role="tablist" aria-label="Xếp theo">
        {RANK_COLS.map((c) => <button key={c.key} role="tab" aria-selected={k === c.key} className={k === c.key ? 'on' : ''} onClick={() => setK(c.key)}>{c.icon} {c.label}</button>)}
      </div>
      <div className="rank-grid">
        <Spotlight top={top} k={k} />
        <div className="rank-tbl">
          <div className="rk-row rk-head">
            <span>#</span><span>CẦU THỦ</span><span>TR</span>
            {RANK_COLS.map((c) => <button key={c.key} className={k === c.key ? 'on' : ''} title={c.hint} onClick={() => setK(c.key)}>{c.short}{k === c.key ? ' ▼' : ''}</button>)}
          </div>
          <div className="rk-body">
          {shown.map((r, i) => {
            const t = tm(r.player.teamId);
            const medal = i < 3 && hasValue(r, k);
            return (
              <button key={r.player.id} className={'rk-row' + (medal ? ' top' : '')} style={{ animationDelay: Math.min(i * 0.04, 0.5) + 's', ...(medal ? { ['--m' as string]: MEDAL[i] } : {}) }} onClick={() => openCard(r.player.id)}>
                <span className="rk-rank">{i + 1}</span>
                <span className="rk-who"><FameAvatar p={r.player} team={t} size={34} /><span><b>{r.player.name}</b><small><i style={{ background: t.color }} />{t.short}</small></span></span>
                <span>{r.apps}</span>
                {RANK_COLS.map((c) => <span key={c.key} className={k === c.key ? 'on' : ''}>{fmtRank(r, c.key)}</span>)}
              </button>
            );
          })}
          {!shown.length && <div className="note" style={{ padding: 12 }}>Chưa có cầu thủ nào trong đội.</div>}
          </div>
          <div className="note" style={{ padding: '4px 4px 0' }}>{col.hint}. Chỉ tính cầu thủ đã có đội và trận đã kết thúc. Độ ổn định cần ít nhất {MIN_RATED} trận có điểm.</div>
        </div>
      </div>
    </section>
  );
}
