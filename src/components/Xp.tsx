// XP bar, per-stat progress, personal tips, history and the quest table.
import { useEffect, useState } from 'react';
import { api, useAccess, useLeague } from '../data/store';
import { Spin, useAction } from '../data/useAction';
import { LBL, LBL_GK, fDate } from '../lib/league';
import type { Player, XpEvent } from '../lib/types';
import { level, RULE_ICON, RULES, statProgress, tips, xpCost } from '../lib/xp';

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
  const { myT } = useAccess();
  const [hist, setHist] = useState<XpEvent[] | null>(null);
  const [showHist, setShowHist] = useState(false);
  const { act, pending, busy } = useAction(1500);
  useEffect(() => { setHist(null); setShowHist(false); }, [p.id, p.xp]);
  const L = p.pos === 'GK' ? LBL_GK : LBL;
  const prog = statProgress(p);
  const hints = tips(p, snap!.matches, snap!.participants);
  const canBonus = !!user && !!myT && p.teamId === myT && p.userId !== user.id;
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
