import { useState } from 'react';
import { Lock, OvrBadge, SecTitle, Trend } from '../components/bits';
import { api, useAccess, useLeague } from '../data/store';
import { dmy, GROUP, money, valueTrend } from '../lib/league';
import type { Group, OfferStatus } from '../lib/types';

const FREE = 'free';

const STS: Record<OfferStatus, [string, string, string]> = {
  pending: ['CHỜ DUYỆT', 'rgba(245,197,66,.15)', '#f5c542'],
  accepted: ['ĐÃ ĐỒNG Ý', 'rgba(31,166,92,.18)', '#4ade80'],
  rejected: ['TỪ CHỐI', 'rgba(229,72,77,.15)', '#ff6b81'],
  cancelled: ['ĐÃ HỦY', 'rgba(255,255,255,.07)', '#8b93a7'],
};

export function Market() {
  const { snap, user, openCard, openModal, run } = useLeague();
  const { tm, canTransfer, isAdmin, myT, staffT, isStaffPlayer, staffLabel } = useAccess();
  const [mTeam, setMTeam] = useState('all');
  const [mPos, setMPos] = useState<'all' | Group>('all');
  const [rqTabSel, setRqTab] = useState<'in' | 'out'>('in');
  if (!user) return <Lock big title="Thị trường chuyển nhượng" desc="Chỉ thành viên DigiEx mới xem được định giá và nhật ký chuyển nhượng. Đăng nhập để tiếp tục." onLogin={() => openModal({ kind: 'login' })} />;

  const d = snap!;
  const T = d.teams;
  const offers = d.offers;
  const fl = d.players.filter((p) => (mTeam === 'all' || (mTeam === FREE ? p.teamId === null : p.teamId === mTeam)) && (mPos === 'all' || GROUP[p.pos] === mPos)).sort((a, b) => b.value - a.value);
  const inCount = staffT ? offers.filter((o) => o.to === staffT && o.status === 'pending').length : 0;
  const rqTab = isAdmin ? 'all' : rqTabSel;
  const rqList = (isAdmin ? offers : staffT ? offers.filter((o) => (rqTab === 'in' ? o.to === staffT : o.from === staffT)) : [])
    .slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const pending = isAdmin ? offers.filter((o) => o.status === 'pending').length : inCount;
  const chip = (label: string, on: boolean, onClick: () => void) => <button key={label} className={'chip' + (on ? ' on' : '')} onClick={onClick}>{label}</button>;

  return (
    <div className="view g20">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="h1">Thị trường chuyển nhượng</h1>
        <div className="lead">Tổng giá trị thị trường <span style={{ color: '#f5c542', fontWeight: 700 }}>{money(d.players.reduce((a, p) => a + p.value, 0))}</span> · {d.players.length} cầu thủ · {d.transfers.length} thương vụ</div>
      </div>
      <div className="filters">
        <div>{[chip('Tất cả đội', mTeam === 'all', () => setMTeam('all')), ...T.map((t) => chip(t.short, mTeam === t.id, () => setMTeam(t.id))), chip(`Tự do (${d.players.filter((p) => !p.teamId).length})`, mTeam === FREE, () => setMTeam(FREE))]}</div>
        <div>{([['all', 'Mọi vị trí'], ['GK', 'GK'], ['DEF', 'Hậu vệ'], ['MID', 'Tiền vệ'], ['FWD', 'Tiền đạo']] as ['all' | Group, string][]).map(([k, l]) => chip(l, mPos === k, () => setMPos(k)))}</div>
      </div>
      <div className="mk">
        <div className="mk-list">
          {!fl.length && <div className="empty">{d.players.length ? 'Không có cầu thủ phù hợp bộ lọc.' : 'Chưa có cầu thủ nào trên thị trường.'}</div>}
          {fl.map((p, i) => {
            const team = tm(p.teamId);
            const staffP = isStaffPlayer(p);
            const canBuy = canTransfer(p.teamId) && !staffP;
            const canOffer = !!staffT && !!p.teamId && p.teamId !== staffT && !staffP;
            const canInvite = !!staffT && !p.teamId && !staffP;
            const sent = !!staffT && offers.some((o) => o.pid === p.id && o.from === staffT && o.status === 'pending');
            return (
              <div key={p.id} className={'mk-row' + (canBuy && (canOffer || canInvite) ? ' b2' : '')} style={{ animationDelay: Math.min(i * 0.03, 0.6).toFixed(2) + 's' }}>
                <OvrBadge p={p} className="mk-badge" onClick={() => openCard(p.id)} />
                <button className="mk-who" onClick={() => openCard(p.id)}>
                  <span>{p.name}{staffLabel(p) && <em className="role-tag">{staffLabel(p)}</em>}</span>
                  <div><i style={{ background: team.color }} />{team.name} · {p.age} tuổi</div>
                </button>
                <span className="mk-val">{money(p.value)}<Trend pct={valueTrend(d.valueHistory[p.id], p.value)} /></span>
                {canBuy && <button className="btn-ghost" onClick={() => openModal({ kind: 'transfer', playerId: p.id })}>Chuyển</button>}
                {(canOffer || canInvite) && <button className={'btn-buy' + (sent ? ' sent' : '')} onClick={() => (sent ? setRqTab('out') : openModal({ kind: 'offer', playerId: p.id }))}>{sent ? 'Đã gửi' : canInvite ? 'Mời' : 'Mua'}</button>}
                {staffP && <span className="st" style={{ background: 'rgba(255,255,255,.07)', color: '#8b93a7' }} title="Chủ tịch / BHL không thể chuyển nhượng">KHÔNG CHUYỂN NHƯỢNG</span>}
              </div>
            );
          })}
        </div>
        <div className="mk-side">
          {(isAdmin || !!staffT) && (
            <div className="rq">
              <div className="row-sb">
                <SecTitle sm>Yêu cầu chuyển nhượng</SecTitle>
                {pending > 0 && <span className="rq-pend">{pending} chờ duyệt</span>}
              </div>
              <div className="seg">
                {isAdmin
                  ? <button className="on">Tất cả yêu cầu</button>
                  : ([['in', 'Nhận được (' + offers.filter((o) => o.to === staffT).length + ')'], ['out', 'Đã gửi (' + offers.filter((o) => o.from === staffT).length + ')']] as ['in' | 'out', string][])
                    .map(([k, l]) => <button key={k} className={rqTab === k ? 'on' : ''} onClick={() => setRqTab(k)}>{l}</button>)}
              </div>
              {rqList.map((o, i) => {
                const p = d.players.find((x) => x.id === o.pid);
                const S = STS[o.status] || STS.cancelled;
                const df = Math.round((o.price / o.value - 1) * 100);
                const pend = o.status === 'pending';
                const seller = tm(o.to), buyer = tm(o.from);
                return (
                  <div key={o.id} className={'rq-item' + (pend ? ' pend' : '')} style={{ animationDelay: (i * 0.05).toFixed(2) + 's' }}>
                    <div className="rq-head">
                      <OvrBadge p={p ? p : { ovr: 60, pos: 'CM' }} className="rq-badge" onClick={() => p && openCard(p.id)} />
                      <div className="rq-who">
                        <span>{p ? p.name : '(Cầu thủ đã rời giải)'}</span>
                        <div className="flow"><span style={{ background: seller.color }}>{seller.short}</span>→<span style={{ background: buyer.color }}>{buyer.short}</span></div>
                      </div>
                      <span className="st" style={{ background: S[1], color: S[2] }}>{S[0]}</span>
                    </div>
                    <div className="rq-price">
                      <div><b>{money(o.price)}</b><small style={{ color: df >= 0 ? '#4ade80' : '#ff6b81' }}>{(df > 0 ? '+' : '') + df}%</small></div>
                      <span>Định giá {money(o.value)}</span>
                    </div>
                    {o.note && <div className="quote">“{o.note}”</div>}
                    <div className="meta">{o.byName} · {dmy(o.date)}</div>
                    {pend && !o.to && <div className="note">Chờ cầu thủ trả lời lời mời.</div>}
                    {pend && !!o.to && o.to === staffT && myT !== o.to && <div className="note">Chờ Chủ tịch {tm(o.to).short} quyết định.</div>}
                    {pend && !!o.to && myT === o.to && (
                      <div className="acts">
                        <button className="btn-ok" onClick={() => run(() => api.respondOffer(o.id, true), (m) => m as string)}>Đồng ý</button>
                        <button className="btn-no" onClick={() => run(() => api.respondOffer(o.id, false), (m) => m as string)}>Từ chối</button>
                      </div>
                    )}
                    {pend && staffT === o.from && <button className="btn-cancel" onClick={() => run(() => api.cancelOffer(o.id), 'Đã hủy yêu cầu')}>Hủy yêu cầu</button>}
                  </div>
                );
              })}
              {!rqList.length && <div className="note" style={{ fontSize: 13 }}>{rqTab === 'out' ? 'Đội bạn chưa gửi đề nghị nào. Bấm "Mua" (cầu thủ có đội) hoặc "Mời" (cầu thủ tự do) để bắt đầu.' : 'Chưa có yêu cầu nào.'}</div>}
            </div>
          )}
          <div className="rq" style={{ borderColor: 'rgba(255,255,255,.07)', animation: 'none' }}>
            <SecTitle sm color="#f5c542">Nhật ký chuyển nhượng</SecTitle>
            {d.transfers.slice().reverse().map((x, i) => {
              const f = tm(x.from), t = tm(x.to);
              return (
                <div key={i} className="log">
                  <div><span>{x.name}</span><b>{money(x.fee)}</b></div>
                  <div className="flow lg"><span style={{ background: f.color }}>{f.short}</span>→<span style={{ background: t.color }}>{t.short}</span><em>{dmy(x.date)}</em></div>
                </div>
              );
            })}
            {!d.transfers.length && <div className="note" style={{ fontSize: 13 }}>Chưa có thương vụ nào.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
