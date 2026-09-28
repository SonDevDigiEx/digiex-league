import { useState } from 'react';
import { Crest, OvrBadge } from '../components/bits';
import { api, useAccess, useLeague } from '../data/store';
import { clamp } from '../lib/league';
import type { Match, Participation, Player, StatsInput, StatsStatus, Team } from '../lib/types';

export const participantsOf = (all: Participation[], matchId: string) => all.filter((x) => x.matchId === matchId);

const STATUS: Record<StatsStatus, [string, string, string]> = {
  none: ['CHƯA ĐIỀN', 'rgba(255,255,255,.07)', '#8b93a7'],
  submitted: ['CHỜ DUYỆT', 'rgba(245,197,66,.15)', '#f5c542'],
  approved: ['ĐÃ DUYỆT', 'rgba(31,166,92,.18)', '#4ade80'],
  rejected: ['BỊ TỪ CHỐI', 'rgba(229,72,77,.15)', '#ff6b81'],
};

/** Pre-match registration: players join for their team; free agents pick a side and are listed separately. */
export function Rsvp({ m }: { m: Match }) {
  const { snap, user, run, openCard } = useLeague();
  const { tm, canVote } = useAccess();
  const d = snap!;
  const H = tm(m.home), A = tm(m.away);
  const rows = participantsOf(d.participants, m.id);
  const me = user ? d.players.find((p) => p.userId === user.id) : undefined;
  const mine = me ? rows.find((r) => r.playerId === me.id) : undefined;
  const open = new Date(m.date).getTime() > Date.now();
  const byId = new Map(d.players.map((p) => [p.id, p]));

  const action = () => {
    if (!open) return <div className="note">Đã hết hạn đăng ký (trận đã bắt đầu).</div>;
    if (!user) return <div className="note">Đăng nhập để đăng ký tham gia.</div>;
    if (!canVote) return <div className="note">Tài khoản đang chờ Ban tổ chức duyệt.</div>;
    if (!me) return <div className="note">Bạn chưa có hồ sơ cầu thủ — liên hệ Ban tổ chức để được duyệt làm cầu thủ.</div>;
    const leave = <button className="btn-cancel" onClick={() => run(() => api.leaveMatch(m.id), 'Đã hủy đăng ký')}>Hủy tham gia</button>;
    if (me.teamId) {
      if (me.teamId !== m.home && me.teamId !== m.away) return <div className="note">Đội của bạn ({tm(me.teamId).short}) không thi đấu trận này.</div>;
      return mine
        ? <div className="rsvp-me"><span>✓ Bạn đã đăng ký đá cho <b style={{ color: tm(mine.teamId).color }}>{tm(mine.teamId).short}</b></span>{leave}</div>
        : <button className="btn-lime lg" style={{ alignSelf: 'flex-start' }} onClick={() => run(() => api.joinMatch(m.id, null), 'Đã đăng ký tham gia')}>Tham gia trận này</button>;
    }
    return (
      <div className="rsvp-me">
        <span>{mine ? <>✓ Cầu thủ tự do · đá cho <b style={{ color: tm(mine.teamId).color }}>{tm(mine.teamId).short}</b></> : 'Cầu thủ tự do · chọn đội muốn đá cùng:'}</span>
        {[H, A].filter((t) => t.id !== mine?.teamId).map((t) => (
          <button key={t.id} className="btn-lime" style={{ background: t.color, color: '#fff' }}
            onClick={() => run(() => api.joinMatch(m.id, t.id), `Đã đăng ký đá cho ${t.short}`)}>{mine ? 'Chuyển sang' : 'Tham gia cho'} {t.short}</button>
        ))}
        {mine && leave}
      </div>
    );
  };

  const col = (t: Team) => {
    const side = rows.filter((r) => r.teamId === t.id).map((r) => byId.get(r.playerId)).filter(Boolean) as Player[];
    const own = side.filter((p) => p.teamId === t.id), free = side.filter((p) => p.teamId !== t.id);
    const line = (p: Player) => (
      <button key={p.id} className={'li' + (p.id === me?.id ? ' me-li' : '')} onClick={() => openCard(p.id)}>
        <span>{p.pos}</span><span>{p.name}{p.id === me?.id ? ' (bạn)' : ''}</span><span>{p.ovr}</span>
      </button>
    );
    return (
      <div key={t.id} className="bench">
        <div className="bench-t"><Crest team={t} text={false} /><div>{t.short} · {side.length} đăng ký</div></div>
        {own.map(line)}
        {!own.length && <div className="note">Chưa có cầu thủ của đội đăng ký.</div>}
        <div className="bench-k">CẦU THỦ TỰ DO · {free.length}</div>
        {free.map(line)}
        {!free.length && <div className="note">—</div>}
      </div>
    );
  };

  return (
    <div className="panel" style={{ gap: 12 }}>
      <div className="row-sb wrap">
        <div className="box-title">Đăng ký tham gia</div>
        <span className="note">{rows.length} cầu thủ</span>
      </div>
      {action()}
      <div className="benches" style={{ flex: 'none' }}>{[H, A].map(col)}</div>
    </div>
  );
}

const EMPTY: StatsInput = { goals: 0, assists: 0, saves: 0, yellow: 0, red: 0, rating: null, note: '' };

/** Post-match: participants report their stats; the side's BHL / chairman (or admin) approves. */
export function MatchStats({ m }: { m: Match }) {
  const { snap, user, run, openCard } = useLeague();
  const { tm, canTeam } = useAccess();
  const d = snap!;
  const rows = participantsOf(d.participants, m.id);
  const byId = new Map(d.players.map((p) => [p.id, p]));
  const me = user ? d.players.find((p) => p.userId === user.id) : undefined;
  const mine = me ? rows.find((r) => r.playerId === me.id) : undefined;

  if (m.status !== 'done') return <div className="none">Thống kê cá nhân mở sau khi trận đấu kết thúc.</div>;

  const side = (t: Team) => {
    const list = rows.filter((r) => r.teamId === t.id);
    const staff = canTeam(t.id);
    const waiting = list.filter((r) => r.status === 'submitted').length;
    return (
      <div key={t.id} className="panel" style={{ gap: 10 }}>
        <div className="row-sb">
          <div className="bench-t"><Crest team={t} text={false} /><div>{t.name}</div></div>
          {staff && waiting > 0 && <span className="rq-pend">{waiting} chờ duyệt</span>}
        </div>
        {!list.length && <div className="note">Không có cầu thủ nào đăng ký đá cho {t.short}.</div>}
        {list.map((r) => {
          const p = byId.get(r.playerId);
          if (!p) return null;
          const [label, bg, fg] = STATUS[r.status];
          const has = r.status !== 'none';
          return (
            <div key={r.playerId} className="st-row">
              <OvrBadge p={p} className="rq-badge" onClick={() => openCard(p.id)} />
              <div className="st-main">
                <div className="st-name"><span>{p.name}{p.teamId !== t.id ? ' · tự do' : ''}</span><em style={{ background: bg, color: fg }}>{label}</em></div>
                {has
                  ? <div className="st-nums">
                      <span>⚽ {r.goals}</span><span>🅰 {r.assists}</span>{!!r.saves && <span>🧤 {r.saves}</span>}
                      {!!r.yellow && <span style={{ color: '#f5c542' }}>🟨 {r.yellow}</span>}{!!r.red && <span style={{ color: '#ff6b81' }}>🟥</span>}
                      {r.rating != null && <span>★ {r.rating.toFixed(1)}</span>}
                    </div>
                  : <div className="note">Chưa điền thông số.</div>}
                {r.note && <div className="quote">“{r.note}”</div>}
                {staff && r.status === 'submitted' && (
                  <div className="acts">
                    <button className="btn-ok" onClick={() => run(() => api.reviewStats(m.id, p.id, true), `Đã duyệt thông số của ${p.name}`)}>Duyệt</button>
                    <button className="btn-no" onClick={() => run(() => api.reviewStats(m.id, p.id, false), `Đã từ chối thông số của ${p.name}`)}>Từ chối</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'viewIn .4s ease both' }}>
      {mine && mine.status !== 'approved' && <MyStatsForm key={mine.status} m={m} row={mine} />}
      {mine && mine.status === 'approved' && <div className="mine">Thông số của bạn đã được duyệt và ghi vào thống kê mùa giải.</div>}
      <div className="two" style={{ animation: 'none' }}>{[tm(m.home), tm(m.away)].map(side)}</div>
      <div className="note">Chỉ thông số đã được BHL / Chủ tịch của đội (hoặc Ban tổ chức) duyệt mới được tính vào thống kê mùa giải.</div>
    </div>
  );
}

function MyStatsForm({ m, row }: { m: Match; row: Participation }) {
  const { run } = useLeague();
  const [s, setS] = useState<StatsInput>(() => row.status === 'none' ? EMPTY : {
    goals: row.goals ?? 0, assists: row.assists ?? 0, saves: row.saves ?? 0, yellow: row.yellow ?? 0, red: row.red ?? 0, rating: row.rating, note: row.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const step = (k: 'goals' | 'assists' | 'saves' | 'yellow' | 'red', max: number) => (dl: number) => setS({ ...s, [k]: clamp(s[k] + dl, 0, max) });
  const field = (label: string, k: 'goals' | 'assists' | 'saves' | 'yellow' | 'red', max: number) => (
    <div className="st-field">
      <span>{label}</span>
      <div className="stepper"><button type="button" onClick={() => step(k, max)(-1)} aria-label="Giảm">−</button><b>{s[k]}</b><button type="button" onClick={() => step(k, max)(1)} aria-label="Tăng">+</button></div>
    </div>
  );
  return (
    <div className="panel" style={{ border: '1px solid rgba(198,255,61,.3)' }}>
      <div className="row-sb wrap">
        <div className="box-title">Thông số của bạn</div>
        {row.status === 'submitted' && <span className="rq-pend">Đã gửi · chờ BHL duyệt</span>}
        {row.status === 'rejected' && <span className="rq-pend" style={{ background: 'rgba(229,72,77,.15)', color: '#ff6b81' }}>Bị từ chối · sửa và gửi lại</span>}
      </div>
      <div className="st-grid">
        {field('Bàn thắng', 'goals', 30)}
        {field('Kiến tạo', 'assists', 30)}
        {field('Cứu thua', 'saves', 50)}
        {field('Thẻ vàng', 'yellow', 2)}
        {field('Thẻ đỏ', 'red', 1)}
      </div>
      <label className="fld g8"><span className="ovr-l">Tự chấm điểm <b>{s.rating == null ? '—' : s.rating.toFixed(1)}</b></span>
        <input type="range" min={1} max={10} step={0.5} value={s.rating ?? 6} onChange={(e) => setS({ ...s, rating: +e.target.value })} />
      </label>
      <label className="fld">Ghi chú (không bắt buộc)<input className="inp" maxLength={300} value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} placeholder="VD: đá cặp trung vệ cả trận" /></label>
      <button className="btn-lime lg" disabled={busy} onClick={async () => {
        setBusy(true);
        await run(() => api.submitStats(m.id, s), row.status === 'submitted' ? 'Đã cập nhật thông số' : 'Đã gửi thông số, chờ BHL duyệt');
        setBusy(false);
      }}>{busy ? 'Đang gửi…' : row.status === 'submitted' ? 'Cập nhật thông số' : 'Gửi thông số'}</button>
    </div>
  );
}

/** Season totals from approved stats only. */
export function seasonStats(all: Participation[], playerId: string) {
  const ok = all.filter((x) => x.playerId === playerId && x.status === 'approved');
  const rated = ok.filter((x) => x.rating != null);
  return {
    played: ok.length,
    goals: ok.reduce((a, x) => a + (x.goals ?? 0), 0),
    assists: ok.reduce((a, x) => a + (x.assists ?? 0), 0),
    rating: rated.length ? rated.reduce((a, x) => a + (x.rating ?? 0), 0) / rated.length : null,
  };
}
