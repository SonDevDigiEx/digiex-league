import { useEffect, useState, type ReactNode } from 'react';
import { api, AUTH_DOMAIN, useAccess, useLeague, type Modal } from '../data/store';
import { DEFAULT_VENUE, genStats, ini, LBL, LBL_GK, money, pad, POSS, readImg, SWATCHES, tier } from '../lib/league';
import type { Foot, Pos } from '../lib/types';

function Shell({ title, cta, err, busy, onSubmit, children }: { title: string; cta: string; err: string; busy: boolean; onSubmit: () => void; children: ReactNode }) {
  const { closeModal } = useLeague();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);
  return (
    <div className="fm" onClick={closeModal}>
      <form className="fm-in" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }}>
        <div className="fm-head"><div className="fm-title">{title}</div><button type="button" className="fm-x" onClick={closeModal} aria-label="Đóng">×</button></div>
        {children}
        {err && <div className="err">{err}</div>}
        <button type="submit" className="btn-submit" disabled={busy}>{busy ? 'Đang xử lý…' : cta}</button>
      </form>
    </div>
  );
}

/** Shared submit plumbing: busy flag, inline error, close on success. */
function useSubmit() {
  const { run, closeModal } = useLeague();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (fn: () => Promise<unknown>, ok: string | ((r: unknown) => string), after?: () => void) => {
    setBusy(true); setErr('');
    try {
      await run(fn, ok, true);
      closeModal();
      after?.();
    } catch (e) {
      setErr((e as Error).message || 'Có lỗi xảy ra.');
    } finally { setBusy(false); }
  };
  return { err, setErr, busy, submit };
}

function LoginForm({ reason }: { reason?: string }) {
  const { signIn } = useLeague();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try { await signIn(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Shell title="Đăng nhập" cta="Đăng nhập với Google" err={err} busy={busy} onSubmit={go}>
      {reason && <div className="info">{reason}</div>}
      <div className="lead" style={{ fontSize: 13 }}>
        Dùng tài khoản Google công ty <b style={{ color: '#fff' }}>@{AUTH_DOMAIN}</b>. Lần đầu đăng nhập bạn là Thành viên; Ban tổ chức sẽ phân quyền Chủ tịch / BHL.
      </div>
    </Shell>
  );
}

/** Create a team (admin) or edit one (staff: motto + chairman quote; admin: also name, code, colours). */
function TeamForm({ teamId }: { teamId?: string }) {
  const { go, snap } = useLeague();
  const { isAdmin } = useAccess();
  const t = teamId ? snap!.teams.find((x) => x.id === teamId) : undefined;
  const sw0 = t ? Math.max(0, SWATCHES.findIndex(([c]) => c.toLowerCase() === t.color.toLowerCase())) : 2;
  const [f, setF] = useState({ name: t?.name || '', short: t?.short || '', motto: t?.motto || '', quote: t?.chair.quote || '', sw: sw0 });
  const { err, setErr, busy, submit } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const input = () => ({ name: f.name, short: f.short, motto: f.motto, chairQuote: f.quote, color: SWATCHES[f.sw][0], color2: SWATCHES[f.sw][1] });
  const adminFields = !t || isAdmin;
  return (
    <Shell title={t ? 'Thông tin đội' : 'Thành lập đội mới'} cta={t ? 'Lưu thay đổi' : 'Tạo đội'} err={err} busy={busy} onSubmit={() => {
      if (!f.name.trim() || !f.short.trim()) return setErr('Nhập tên đội và mã đội.');
      if (t) return submit(() => api.updateTeam(t.id, input()), 'Đã cập nhật ' + f.name.trim());
      let id = '';
      submit(async () => { id = (await api.createTeam(input())).id; }, `Đã thành lập ${f.name.trim()}`, () => go({ view: 'teams', teamId: id }));
    }}>
      {adminFields && <label className="fld">Tên đội<input className="inp" value={f.name} onChange={set('name')} placeholder="VD: F10 Phoenix" maxLength={60} /></label>}
      {adminFields && <label className="fld">Mã đội (2–4 ký tự)<input className="inp" value={f.short} onChange={set('short')} placeholder="F10" maxLength={4} /></label>}
      <label className="fld">Khẩu hiệu<input className="inp" value={f.motto} onChange={set('motto')} placeholder="Chiến đến cùng" maxLength={120} /></label>
      {t && <label className="fld">Phát biểu của Chủ tịch<input className="inp" value={f.quote} onChange={set('quote')} maxLength={160} /></label>}
      {adminFields && (
        <div className="fld g8">Màu áo
          <div style={{ display: 'flex', gap: 10 }}>
            {SWATCHES.map(([c, c2], i) => (
              <button type="button" key={c} className="sw" aria-label={c} onClick={() => setF({ ...f, sw: i })}
                style={{ background: `linear-gradient(160deg,${c},${c2})`, transform: `scale(${f.sw === i ? 1.2 : 1})`, opacity: f.sw === i ? 1 : 0.55 }} />
            ))}
          </div>
        </div>
      )}
      {!t && <div className="fm-note">Sau khi tạo đội, vào <span>Quản lý → Thành viên</span> để chỉ định Chủ tịch và BHL.</div>}
    </Shell>
  );
}

function PlayerForm({ playerId, teamId }: { playerId?: string; teamId: string }) {
  const { snap, flash } = useLeague();
  const { tm } = useAccess();
  const p = playerId ? snap!.players.find((x) => x.id === playerId) : undefined;
  const [f, setF] = useState(() => p
    ? { name: p.name, pos: p.pos, num: String(p.num), age: String(p.age), foot: p.foot, ovr: p.ovr, stats: p.stats.slice(), photo: p.photo || '' }
    : { name: '', pos: 'CM' as Pos, num: '', age: '25', foot: 'Phải' as Foot, ovr: 72, stats: genStats('CM', 72, Date.now() % 997), photo: '' });
  const [uploading, setUploading] = useState(false);
  const { err, setErr, busy, submit } = useSubmit();
  const team = tm(p?.teamId || teamId);
  const L = f.pos === 'GK' ? LBL_GK : LBL;
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { const url = await api.uploadPlayerPhoto(team.id, await readImg(file, 360, 'image/jpeg')); setF((s) => ({ ...s, photo: url })); }
    catch (x) { flash((x as Error).message || 'Không đọc được ảnh', true); }
    finally { setUploading(false); }
  };
  return (
    <Shell title={p ? 'Chỉnh sửa cầu thủ' : 'Thêm cầu thủ'} cta={p ? 'Lưu thay đổi' : 'Đăng ký'} err={err} busy={busy || uploading} onSubmit={() => {
      if (!f.name.trim()) return setErr('Nhập tên cầu thủ.');
      submit(() => api.savePlayer({
        id: p?.id, teamId: team.id, name: f.name, pos: f.pos, ovr: f.ovr, foot: f.foot, stats: f.stats, photo: f.photo || null,
        num: +f.num || p?.num || 99, age: +f.age || p?.age || 25,
      }), (p ? 'Đã cập nhật ' : 'Đã đăng ký ') + f.name.trim());
    }}>
      <div className="ph-row">
        <div className="ph" style={{ background: f.photo ? `center/cover url("${f.photo}")` : 'rgba(255,255,255,.05)' }}>{f.photo ? '' : f.name ? ini(f.name) : '+'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="lead" style={{ font: "500 12px/1.4 'Be Vietnam Pro',sans-serif" }}>{(p ? 'Chỉnh sửa hồ sơ · ' : 'Đăng ký vào ') + team.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <label className="ph-btn">{uploading ? 'Đang tải…' : 'Tải ảnh cầu thủ'}<input type="file" accept="image/*" onChange={onPhoto} /></label>
            {f.photo && <button type="button" className="ph-btn grey" onClick={() => setF({ ...f, photo: '' })}>Gỡ ảnh</button>}
          </div>
        </div>
      </div>
      <label className="fld">Họ và tên<input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nguyễn Văn A" /></label>
      <div className="fld g8">Vị trí<div className="opts">{POSS.map((x) => <button type="button" key={x} className={'opt' + (f.pos === x ? ' on' : '')} onClick={() => setF({ ...f, pos: x })}>{x}</button>)}</div></div>
      <div className="fld g8">Chân thuận<div className="opts">{(['Phải', 'Trái'] as Foot[]).map((x) => <button type="button" key={x} className={'opt vn' + (f.foot === x ? ' on' : '')} onClick={() => setF({ ...f, foot: x })}>{x}</button>)}</div></div>
      <label className="fld g8"><span className="ovr-l">Chỉ số tổng (OVR) <b>{f.ovr}</b></span><input type="range" min={40} max={99} value={f.ovr} onChange={(e) => setF({ ...f, ovr: +e.target.value })} /></label>
      <div className="stat-box">
        <div className="stat-box-h"><span>CHỈ SỐ CHI TIẾT</span><button type="button" onClick={() => setF({ ...f, ovr: Math.round(f.stats.reduce((a, b) => a + b, 0) / f.stats.length) })}>Tính OVR theo chỉ số</button></div>
        {f.stats.map((v, j) => (
          <div key={j} className="stat-r">
            <span>{L[j]}</span>
            <input type="range" min={20} max={99} value={v} aria-label={L[j]} onChange={(e) => { const a = f.stats.slice(); a[j] = +e.target.value; setF({ ...f, stats: a }); }} />
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="g2">
        <label className="fld">Số áo<input className="inp" type="number" min={0} max={99} value={f.num} onChange={(e) => setF({ ...f, num: e.target.value })} /></label>
        <label className="fld">Tuổi<input className="inp" type="number" min={10} max={80} value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /></label>
      </div>
    </Shell>
  );
}

function TransferForm({ playerId }: { playerId: string }) {
  const { snap, closeCard } = useLeague();
  const { tm } = useAccess();
  const p = snap!.players.find((x) => x.id === playerId)!;
  const T = snap!.teams;
  const [to, setTo] = useState(T.find((t) => t.id !== p.teamId)?.id || '');
  const [fee, setFee] = useState(p.value.toFixed(1));
  const { err, setErr, busy, submit } = useSubmit();
  const t = tier(p.ovr);
  return (
    <Shell title="Chuyển nhượng" cta="Xác nhận chuyển nhượng" err={err} busy={busy} onSubmit={() => {
      if (!to) return setErr('Chọn đội nhận.');
      submit(() => api.transferPlayer(p.id, to, +fee || p.value), 'Chuyển nhượng thành công: ' + p.name, closeCard);
    }}>
      <div className="pbox">
        <div className="badge" style={{ background: t.bg, color: t.fg }}>{p.ovr}</div>
        <div><span>{p.name}</span><span>Hiện tại: {tm(p.teamId).name} · Định giá {money(p.value)}</span></div>
      </div>
      <div className="fld g8">Chuyển đến
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {T.filter((x) => x.id !== p.teamId).map((x) => (
            <button type="button" key={x.id} className="dest" style={{ borderColor: to === x.id ? x.color : undefined }} onClick={() => setTo(x.id)}><i style={{ background: x.color }} />{x.name}</button>
          ))}
        </div>
      </div>
      <label className="fld">Phí chuyển nhượng (tỷ)<input className="inp money" type="number" step="0.1" min={0} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
    </Shell>
  );
}

function OfferForm({ playerId }: { playerId: string }) {
  const { snap, closeCard } = useLeague();
  const { tm, myT } = useAccess();
  const p = snap!.players.find((x) => x.id === playerId)!;
  const [price, setPrice] = useState(p.value.toFixed(1));
  const [note, setNote] = useState('');
  const { err, setErr, busy, submit } = useSubmit();
  const pr = +price || 0;
  const df = Math.round((pr / p.value - 1) * 100);
  const seller = tm(p.teamId);
  const t = tier(p.ovr);
  return (
    <Shell title="Đề nghị mua cầu thủ" cta="Gửi yêu cầu chuyển nhượng" err={err} busy={busy} onSubmit={() => {
      if (!(pr > 0)) return setErr('Nhập giá đề nghị hợp lệ.');
      submit(() => api.makeOffer(p.id, pr, note), 'Đã gửi đề nghị tới Chủ tịch ' + seller.short, closeCard);
    }}>
      <div className="pbox">
        <div className="badge" style={{ background: t.bg, color: t.fg }}>{p.ovr}</div>
        <div><span>{p.name}</span><span>{p.pos} · {seller.name}</span></div>
      </div>
      <div className="g2">
        <div className="pricebox"><span>GIÁ HIỆN TẠI</span><b>{money(p.value)}</b></div>
        <div className="pricebox gold"><span>GIÁ ĐỀ NGHỊ</span><b>{money(pr)}</b></div>
      </div>
      <label className="fld"><span style={{ display: 'flex', justifyContent: 'space-between' }}>Giá mong muốn (tỷ)<span style={{ color: df >= 0 ? '#4ade80' : '#ff6b81' }}>{pr ? (df > 0 ? '+' : '') + df + '% so với định giá' : ''}</span></span>
        <input className="inp money" type="number" step="0.1" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <div className="opts">{([['-10%', 0.9], ['Bằng giá', 1], ['+10%', 1.1], ['+25%', 1.25]] as [string, number][]).map(([l, k]) => <button type="button" key={l} className="opt q" onClick={() => setPrice((p.value * k).toFixed(1))}>{l}</button>)}</div>
      <label className="fld">Lời nhắn cho chủ tịch<textarea className="inp" rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="VD: Cần tăng cường hàng công cho mùa giải..." /></label>
      <div className="fm-note">Yêu cầu từ <span>{myT ? tm(myT).name : ''}</span> sẽ được gửi tới Chủ tịch <span>{seller.chair.name}</span> để duyệt.</div>
    </Shell>
  );
}

function ScheduleForm() {
  const { snap } = useLeague();
  const T = snap!.teams;
  const t = new Date(Date.now() + 14 * 864e5);
  const [f, setF] = useState({ home: T[0]?.id || '', away: (T[1] || T[0])?.id || '', date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T19:30`, venue: DEFAULT_VENUE });
  const { err, setErr, busy, submit } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Shell title="Lên lịch thi đấu" cta="Tạo trận đấu" err={err} busy={busy} onSubmit={() => {
      if (!f.home || !f.away || f.home === f.away) return setErr('Chọn hai đội khác nhau.');
      if (!f.date) return setErr('Chọn thời gian.');
      submit(() => api.scheduleMatch({ ...f, venue: f.venue.trim() || DEFAULT_VENUE }), 'Đã lên lịch trận đấu');
    }}>
      <div className="g2">
        <label className="fld">Đội nhà<select className="inp" value={f.home} onChange={set('home')}>{T.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="fld">Đội khách<select className="inp" value={f.away} onChange={set('away')}>{T.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <label className="fld">Thời gian<input className="inp" type="datetime-local" value={f.date} onChange={set('date')} /></label>
      <label className="fld">Sân thi đấu<input className="inp" value={f.venue} onChange={set('venue')} /></label>
    </Shell>
  );
}

export function FormModal() {
  const { modal, snap } = useLeague();
  if (!modal) return null;
  const m: Modal = modal;
  switch (m.kind) {
    case 'login': return <LoginForm reason={m.reason} />;
    case 'addTeam': return <TeamForm />;
    case 'editTeam': return <TeamForm key={m.teamId} teamId={m.teamId} />;
    case 'player': return !m.playerId || snap?.players.some((p) => p.id === m.playerId) ? <PlayerForm key={m.playerId || 'new'} playerId={m.playerId} teamId={m.teamId} /> : null;
    case 'transfer': return snap?.players.some((p) => p.id === m.playerId) ? <TransferForm playerId={m.playerId} /> : null;
    case 'offer': return snap?.players.some((p) => p.id === m.playerId) ? <OfferForm playerId={m.playerId} /> : null;
    case 'schedule': return <ScheduleForm />;
  }
}
