// XP bar, per-stat progress, personal tips, history and the quest table.
import { useEffect, useState } from 'react';
import { api, useAccess, useLeague } from '../data/store';
import { Spin, useAction } from '../data/useAction';
import { LBL, LBL_GK, fDate } from '../lib/league';
import type { Player, XpEvent } from '../lib/types';
import { level, nextQuests, pendingXp, RULE_ICON, RULES, statProgress, tips, xpCost } from '../lib/xp';

/** Compact level + XP bar (also used on its own). */
export function XpBar({ p }: { p: Player }) {
  const lv = level(p.xp ?? 0);
  return (
    <div className="xpbar" title={`${p.xp ?? 0} XP`}>
      <span className="xp-lv"><small>LV</small>{lv.level}</span>
      <div className="xp-track"><div style={{ width: lv.pct + '%' }} /><span>{lv.title} · {p.xp ?? 0}/{lv.to} XP</span></div>
    </div>
  );
}

export function XpPanel({ p, own }: { p: Player; own?: boolean }) {
  const { snap, user, openModal } = useLeague();
  const { myT, isAdmin } = useAccess();
  const [hist, setHist] = useState<XpEvent[] | null>(null);
  const [showHist, setShowHist] = useState(false);
  const { act, pending, busy } = useAction(1500);
  useEffect(() => { setHist(null); setShowHist(false); }, [p.id, p.xp]);
  const L = p.pos === 'GK' ? LBL_GK : LBL;
  const prog = statProgress(p);
  const hints = tips(p, snap!.matches, snap!.participants);
  const canBonus = !!user && p.userId !== user.id && ((!!myT && p.teamId === myT) || (isAdmin && !!p.teamId));
  const loadHist = async () => {
    setShowHist((s) => !s);
    if (!hist) { try { setHist(await api.xpHistory(p.id)); } catch { setHist([]); } }
  };
  return (
    <div className="xp">
      <div className="row-sb" style={{ alignItems: 'center' }}>
        <span className="k10">KINH NGHIỆM</span>
        <a className="more" onClick={() => openModal({ kind: 'xpRules' })}>📜 Bảng nhiệm vụ</a>
      </div>
      <XpBar p={p} />
      {pendingXp(p, snap!.matches, snap!.participants).map((x) => (
        <div key={x.matchId} className="xp-pending">⏳ {x.text}</div>
      ))}
      <div className="xp-stats">
        {prog.map((s, i) => (
          <div key={i} className="xp-stat" title={s.v >= 99 ? 'Tối đa' : `${s.have}/${s.need} XP để lên ${s.v + 1}`}>
            <span>{L[i]}</span><b>{s.v}</b>
            <div><div style={{ width: s.pct + '%' }} /></div>
            <small>{s.v >= 99 ? 'MAX' : `${s.have}/${s.need}`}</small>
          </div>
        ))}
      </div>
      {canBonus && (
        <button className="xp-bonus" disabled={busy} onClick={() => act('bonus', () => api.hotBonus(p.id), (m) => m as string)}>
          {pending ? <Spin /> : '🧧'} Thưởng nóng +30 XP <small>(1 phong bì/tuần)</small>
        </button>
      )}
      <div className="xp-tips">
        <b>{own ? 'Cách tăng chỉ số của bạn' : 'Gợi ý tăng chỉ số'}</b>
        <ul>{hints.map((h, i) => <li key={i} className={h.startsWith('🤫') ? 'secret' : ''}>{h}</li>)}</ul>
      </div>
      {user && <a className="more" onClick={loadHist}>{showHist ? 'Ẩn lịch sử XP ▲' : 'Lịch sử XP ▼'}</a>}
      {showHist && (
        <div className="xp-hist">
          {!hist && <div className="note">Đang tải…</div>}
          {hist && !hist.length && <div className="note">Chưa có XP nào. Đá trận đầu tiên để bắt đầu!</div>}
          {hist?.map((e) => (
            <div key={e.id} className="xp-ev">
              <span>{RULE_ICON[e.kind] ?? '•'}</span>
              <span className="xp-ev-n">{e.note || e.kind}<small>{fDate(e.date)} · {e.dist.map((d, i) => (d ? `${L[i]} ${d > 0 ? '+' : ''}${d}` : '')).filter(Boolean).join(' · ')}</small></span>
              <b className={e.amount < 0 ? 'neg' : ''}>{e.amount > 0 ? '+' : ''}{e.amount}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Popup: every quest, the cost curve, levels. */
export function XpRules() {
  const { closeModal } = useLeague();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);
  const costs = [60, 70, 75, 80, 85, 90, 95];
  return (
    <div className="fm" onClick={closeModal}>
      <div className="fm-in xpr" role="dialog" aria-modal="true" aria-label="Bảng nhiệm vụ" onClick={(e) => e.stopPropagation()}>
        <div className="fm-head"><div className="fm-title">📜 Bảng nhiệm vụ kinh nghiệm</div><button type="button" className="fm-x" onClick={closeModal} aria-label="Đóng">×</button></div>
        <div className="note" style={{ fontSize: 13 }}>
          Chỉ số không ai chỉnh tay nữa: bạn <b style={{ color: '#fff' }}>làm nhiệm vụ → nhận XP → XP tự cộng vào chỉ số</b>. Hệ thống tự tính sau mỗi trận kết thúc
          (khi BTC nhập tỉ số, BHL duyệt thông số, chọn MOM). XP “chia theo vị trí” đổ nhiều vào chỉ số quan trọng của vị trí chính của bạn.
        </div>
        <div className="xpr-list">
          {RULES.map((r) => (
            <div key={r.kind} className={'xpr-row' + (r.kind === 'absent' ? ' neg' : '') + (r.kind === 'bonus' ? ' fun' : '')}>
              <span className="xpr-ic">{r.icon}</span>
              <div><b>{r.title}</b><small>{r.who ? r.who + ' · ' : ''}{r.goes}</small></div>
              <em>{r.xp}</em>
            </div>
          ))}
        </div>
        <div className="stat-box">
          <div className="stat-box-h"><span>CHỈ SỐ CÀNG CAO CÀNG KHÓ LÊN</span><span style={{ letterSpacing: 0 }}>XP cần cho +1</span></div>
          <div className="xpr-cost">{costs.map((v) => <div key={v}><span>{v}→{v + 1}</span><b>{xpCost(v)}</b></div>)}</div>
          <div className="note">Mỗi điểm đắt hơn điểm trước ~10%. Trừ điểm chỉ ăn vào tiến độ, chỉ số không bao giờ tụt.</div>
        </div>
        <div className="xpr-fun">🤫 <b>Mẹo không chính thức:</b> đi đêm với Chủ tịch CLB. Mỗi tuần Chủ tịch có đúng 1 phong bì “thưởng nóng” +30 XP cho 1 cầu thủ trong đội. Cà phê sáng, xách nước, nhặt bóng… tùy tâm. BTC không chịu trách nhiệm 😏</div>
      </div>
    </div>
  );
}

/** Home: the signed-in player's progress, always at the top. */
export function MyJourney() {
  const { snap, go, openModal } = useLeague();
  const { myPlayer, tm } = useAccess();
  if (!myPlayer || !snap) return null;
  const p = myPlayer;
  const team = tm(p.teamId);
  const L = p.pos === 'GK' ? LBL_GK : LBL;
  const lv = level(p.xp ?? 0);
  const prog = statProgress(p).map((s, i) => ({ ...s, i, left: s.need - s.have }));
  const closest = prog.filter((s) => s.v < 99).sort((a, b) => a.left - b.left)[0];
  const quests = nextQuests(p, snap.matches, snap.participants).slice(0, 3);
  return (
    <section className="journey" style={{ ['--tc' as string]: team.color }}>
      <div className="jr-me" role="button" tabIndex={0} onClick={() => openModal({ kind: 'me' })} onKeyDown={(e) => { if (e.key === 'Enter') openModal({ kind: 'me' }); }}>
        <div className="jr-ovr"><b>{p.ovr}</b><span>{p.pos}</span></div>
        <div className="jr-main">
          <div className="jr-k">HÀNH TRÌNH CỦA BẠN</div>
          <div className="jr-name">{p.name}</div>
          <div className="jr-lv"><span>LV {lv.level}</span>{lv.title}</div>
          <div className="xp-track"><div style={{ width: lv.pct + '%' }} /><span>{p.xp ?? 0}/{lv.to} XP</span></div>
        </div>
      </div>
      <div className="jr-stats">
        {prog.map((s) => (
          <div key={s.i} className={'jr-stat' + (closest && s.i === closest.i ? ' hot' : '')} title={`${s.have}/${s.need} XP để lên ${s.v + 1}`}>
            <span>{L[s.i]}</span><b>{s.v}</b><div><div style={{ width: s.pct + '%' }} /></div>
          </div>
        ))}
        {closest && <div className="jr-close">📈 <b>{L[closest.i]}</b> còn <b>{closest.left} XP</b> nữa lên {closest.v + 1}</div>}
      </div>
      <div className="jr-quests">
        <div className="row-sb"><span className="jr-k">NHIỆM VỤ TIẾP THEO</span><a className="more" onClick={() => openModal({ kind: 'xpRules' })}>📜 Tất cả</a></div>
        {pendingXp(p, snap.matches, snap.participants).slice(0, 1).map((x) => (
          <button key={x.matchId} className="jr-q pend" onClick={() => go({ view: 'match', matchId: x.matchId })}>
            <span>⏳</span><span className="jr-q-t">{x.text.replace(' (BTC nhập tỉ số)', '')}</span><b>+20</b>
          </button>
        ))}
        {quests.map((q, i) => (
          <button key={i} className="jr-q" onClick={() => (q.matchId ? go({ view: 'match', matchId: q.matchId }) : openModal({ kind: 'xpRules' }))}>
            <span>{q.icon}</span><span className="jr-q-t">{q.text}</span><b>{q.xp}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Celebrates XP gained since the last visit (per browser), incl. stats that went up. */
export function XpWatcher() {
  const { myPlayer } = useAccess();
  const [pop, setPop] = useState<{ gain: number; ups: string[]; lvUp: number | null } | null>(null);
  useEffect(() => {
    if (!myPlayer) return;
    const key = 'dx-xp-seen:' + myPlayer.id;
    const now = { xp: myPlayer.xp ?? 0, stats: myPlayer.stats };
    let prev: typeof now | null = null;
    try { prev = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* storage unavailable */ }
    try { localStorage.setItem(key, JSON.stringify(now)); } catch { /* ignore */ }
    if (!prev || prev.xp === now.xp) return;
    const L = myPlayer.pos === 'GK' ? LBL_GK : LBL;
    const ups = now.stats.map((v, i) => (prev!.stats?.[i] != null && v > prev!.stats[i] ? `${L[i]} ${prev!.stats[i]} → ${v}` : '')).filter(Boolean);
    const a = level(prev.xp).level, b = level(now.xp).level;
    setPop({ gain: now.xp - prev.xp, ups, lvUp: b > a ? b : null });
  }, [myPlayer?.id, myPlayer?.xp]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pop) return null;
  const good = pop.gain > 0;
  return (
    <div className={'xp-pop' + (good ? '' : ' neg')} role="status" onClick={() => setPop(null)}>
      <div className="xp-pop-in">
        <div className="xp-pop-big">{good ? '+' : ''}{pop.gain} XP</div>
        {pop.lvUp && <div className="xp-pop-lv">🎉 Lên cấp {pop.lvUp}!</div>}
        {pop.ups.map((u) => <div key={u} className="xp-pop-up">⬆ {u}</div>)}
        {!good && <div className="xp-pop-note">Vắng trận bị trừ tiến độ — chỉ số không tụt. Trận sau nhớ bấm “Tham gia” nhé!</div>}
        <small>Bấm để đóng</small>
      </div>
    </div>
  );
}
