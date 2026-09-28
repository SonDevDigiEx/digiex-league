import { useEffect, useState } from 'react';
import { PlayerCard, Sparkline, Trend } from '../components/bits';
import { api, useAccess, useLeague } from '../data/store';
import { seasonStats } from '../views/MatchPlayers';
import { hexA, LBL, LBL_GK, money, tier, valueTrend } from '../lib/league';
import { awardIcon } from '../lib/tournament';
import { XpPanel } from '../components/Xp';
import type { ValueFactors } from '../lib/types';

const RINGS = ['100,20 169.3,60 169.3,140 100,180 30.7,140 30.7,60', '100,46.7 146.2,73.3 146.2,126.7 100,153.3 53.8,126.7 53.8,73.3', '100,73.3 123.1,86.7 123.1,113.3 100,126.7 76.9,113.3 76.9,86.7'];
const LABEL_XY: [number, number][] = [[100, 8], [186, 56], [186, 152], [100, 198], [14, 152], [14, 56]];
const col = (v: number) => (v >= 85 ? '#c6ff3d' : v >= 75 ? '#f5c542' : v >= 65 ? '#ff9f43' : '#ff6b81');

export function CardModal() {
  const { snap, cardId, closeCard, openModal, go, user } = useLeague();
  const { tm, canTransfer, canTeam, staffT, isStaffPlayer, staffLabel } = useAccess();
  const p = cardId ? snap?.players.find((x) => x.id === cardId) : null;
  useEffect(() => {
    if (!p) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCard(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, closeCard]);
  if (!p) return null;

  const team = tm(p.teamId);
  const staffP = isStaffPlayer(p);
  const roleTag = staffLabel(p);
  const t = tier(p.ovr);
  const L = p.pos === 'GK' ? LBL_GK : LBL;
  const radar = p.stats.map((v, j) => {
    const a = ((-90 + 60 * j) * Math.PI) / 180, r = (80 * v) / 99;
    return (100 + r * Math.cos(a)).toFixed(1) + ',' + (100 + r * Math.sin(a)).toFixed(1);
  }).join(' ');
  const season = seasonStats(snap!.participants, p.id);
  const hist = snap!.valueHistory[p.id] || [];
  const trend = valueTrend(hist, p.value);
  const honors = snap!.awards.filter((a) => a.playerId === p.id);
  const tourName = (id: string) => snap!.tournaments.find((x) => x.id === id)?.name || 'Giải đấu';
  const info = [{ l: 'OVR', v: p.ovr, c: '#c6ff3d' }, { l: 'TUỔI', v: p.age, c: '#fff' }, { l: 'CHÂN', v: p.foot, c: '#fff' }, { l: 'GIÁ TRỊ', v: money(p.value), c: '#f5c542' }];

  return (
    <div className="cm" onClick={closeCard} role="dialog" aria-modal="true" aria-label={p.name}>
      <div className="cm-in" onClick={(e) => e.stopPropagation()}>
        <div className="cm-card">
          <div className="cm-rays" style={{ background: `repeating-conic-gradient(from 0deg,${t.glow} 0 6deg,transparent 6deg 18deg)` }} />
          <div className="cm-flip"><div className="cm-scale"><PlayerCard p={p} team={team} still /></div></div>
        </div>
        <div className="cm-body">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="cm-tier" style={{ background: t.bg, color: t.fg }}>{t.label}</span>
            <span className="cm-sub">{team.name} · #{p.num} · {p.positions.join(' / ')}</span>
            {roleTag && <em className="role-tag">{roleTag}</em>}
          </div>
          <h2 className="cm-name">{p.name}</h2>
          <div className="cm-info">{info.map((i) => <div key={i.l}><span>{i.l}</span><b style={{ color: i.c }}>{i.v}</b></div>)}</div>
          {season.played > 0 && (
            <div className="cm-info">
              {[{ l: 'TRẬN', v: season.played }, { l: 'BÀN THẮNG', v: season.goals }, { l: 'KIẾN TẠO', v: season.assists }, { l: 'ĐIỂM TB', v: season.rating == null ? '—' : season.rating.toFixed(1) }]
                .map((i) => <div key={i.l}><span>{i.l}</span><b style={{ color: '#fff' }}>{i.v}</b></div>)}
            </div>
          )}
          <div className="cm-stats">
            <svg viewBox="0 0 200 200" width="190" height="190" style={{ flex: 'none', overflow: 'visible' }}>
              {RINGS.map((pts, i) => <polygon key={i} points={pts} fill={i ? 'none' : 'rgba(255,255,255,.03)'} stroke={i ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.15)'} />)}
              <polygon points={radar} fill={hexA(team.color, 0.35)} stroke={team.color} strokeWidth="2" style={{ animation: 'pop .8s .4s ease both', transformOrigin: '100px 100px' }} />
              {LABEL_XY.map(([x, y], j) => <text key={j} x={x} y={y} textAnchor="middle" fill="#aab2c5" fontSize="11" fontFamily="Barlow Condensed" fontWeight="700">{L[j]}</text>)}
            </svg>
            <div className="cm-bars">
              {p.stats.map((v, j) => (
                <div key={j} className="cm-bar">
                  <span>{L[j]}</span>
                  <div><div style={{ width: v + '%', background: col(v), animationDelay: 0.3 + j * 0.06 + 's' }} /></div>
                  <b style={{ color: col(v) }}>{v}</b>
                </div>
              ))}
            </div>
          </div>
          {honors.length > 0 && (
            <div className="honors">
              <div className="k10">DANH HIỆU · {honors.length}</div>
              {honors.map((a) => (
                <a key={a.id} className="honor" onClick={() => { closeCard(); go({ view: 'tournament', id: a.tournamentId }); }}>
                  <span className="aw-icon sm">{awardIcon(a.kind)}</span><b>{a.title}</b><span>{tourName(a.tournamentId)}</span>
                </a>
              ))}
            </div>
          )}
          <XpPanel p={p} own={!!user && p.userId === user.id} />
          <ValueBox playerId={p.id} value={p.value} trend={trend} history={hist.map((h) => h.value)} />
          <div className="cm-acts">
            {canTransfer(p.teamId) && !staffP && <button className="cm-btn lime" onClick={() => openModal({ kind: 'transfer', playerId: p.id })}>Chuyển nhượng</button>}
            {canTeam(p.teamId) && <button className="cm-btn line" onClick={() => openModal({ kind: 'player', playerId: p.id, teamId: p.teamId })}>Chỉnh sửa</button>}
            {!!staffT && !staffP && p.teamId !== staffT && <button className="cm-btn gold" onClick={() => openModal({ kind: 'offer', playerId: p.id })}>{p.teamId ? 'Đề nghị mua' : `Mời về ${tm(staffT).short}`}</button>}
            <button className="cm-btn close" onClick={closeCard}>Đóng</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Market value: trend, sparkline, and an on-demand breakdown of the formula. */
function ValueBox({ playerId, value, trend, history }: { playerId: string; value: number; trend: number | null; history: number[] }) {
  const [f, setF] = useState<ValueFactors | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setF(null); setOpen(false); }, [playerId]);
  const { reload } = useLeague();
  const toggle = async () => {
    setOpen((o) => !o);
    if (f) return;
    try {
      const live = await api.valueFactors(playerId);
      setF(live);
      // The stored value drifted from the formula: let the server resync it, then refresh the page data.
      if (Math.abs(Number(live.value) - value) >= 0.05) {
        api.syncPlayerValue(playerId).then(() => reload()).catch((e) => console.error('[DigiEx League] sync value', e));
      }
    } catch (e) { setErr((e as Error).message); }
  };
  const pct = (x: number) => { const d = Math.round((x - 1) * 100); return d === 0 ? '±0%' : (d > 0 ? '+' : '−') + Math.abs(d) + '%'; };
  const cls = (x: number) => (x > 1.001 ? 'pos' : x < 0.999 ? 'neg' : '');
  const row = (label: string, x: number, note?: string) => (
    <div className="why-row"><span>{label}{note ? <span className="note"> · {note}</span> : null}</span><b className={cls(x)}>×{x.toFixed(2)} ({pct(x)})</b></div>
  );
  return (
    <div className="why" style={{ gap: 10 }}>
      <div className="row-sb" style={{ alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="k10">GIÁ TRỊ THỊ TRƯỜNG</span>
          <span style={{ font: "800 26px/1 'Barlow Condensed',sans-serif", color: '#f5c542' }}>{money(value)}<Trend pct={trend} /></span>
        </div>
        <Sparkline points={history} w={160} h={42} />
      </div>
      <a className="more" onClick={toggle}>{open ? 'Ẩn cách tính ▲' : 'Vì sao giá này? ▼'}</a>
      {open && !f && !err && <div className="note">Đang tải…</div>}
      {err && <div className="err">{err}</div>}
      {open && f && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="why-row"><span>Giá gốc theo OVR</span><b>{money(f.base)}</b></div>
          {row('Tuổi', f.age)}
          {row('Vị trí chính', f.position)}
          {row('Phong độ', f.form, f.matches ? `${f.matches} trận gần nhất: ${f.goals} bàn, ${f.assists} kiến tạo${f.rating != null ? `, điểm TB ${Number(f.rating).toFixed(1)}` : ''}${f.red ? `, ${f.red} thẻ đỏ` : ''}` : 'chưa có thống kê được duyệt')}
          {row('Chuyên cần', f.attendance, f.teamMatches ? `đá ${f.played}/${f.teamMatches} trận gần nhất của đội` : 'chưa có dữ liệu')}
          {row('Độ hot', f.hot, f.offers ? `${f.offers} đề nghị đang chờ` : 'không có đề nghị')}
          {f.floor != null && <div className="why-row"><span>Sàn giá (80% phí mua gần đây)</span><b>{money(f.floor)}</b></div>}
          <div className="why-row why-total"><span>Giá hiện tại</span><b>{money(f.value)}</b></div>
        </div>
      )}
    </div>
  );
}
