import { useEffect, useState, type ReactNode } from 'react';
import { Crest, PlayerCard } from '../components/bits';
import { Spin, useAction } from '../data/useAction';
import { api, useAccess, useLeague, type Modal } from '../data/store';
import { dmy, DEFAULT_VENUE, nextFreeNum, ovrOf, fDate, fTime, genStats, ini, ROLE_LABEL, LBL, LBL_GK, money, pad, POSS, readImg, SWATCHES, tier } from '../lib/league';
import type { Foot, Player, Pos, Role, TournamentInput } from '../lib/types';
import { rulesTemplate, STRUCTURE_LABEL, TEMPLATES } from '../lib/tournament';

function Shell({ title, cta, err, busy, onSubmit, children }: { title: string; cta?: string; err: string; busy: boolean; onSubmit: () => void; children: ReactNode }) {
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
        {cta && <button type="submit" className="btn-submit" disabled={busy}>{busy ? 'Đang xử lý…' : cta}</button>}
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
  const { signIn, me } = useLeague();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try { await signIn(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  if (me?.role === 'pending') {
    return (
      <Shell title="Đang chờ duyệt" err="" busy={false} onSubmit={() => {}}>
        <div className="info">Tài khoản <b>{me.email}</b> đã đăng ký thành công và đang chờ Ban tổ chức duyệt.</div>
        <div className="lead" style={{ fontSize: 13 }}>Sau khi được duyệt, bạn sẽ xem được thẻ cầu thủ, phân tích trận, thị trường chuyển nhượng và tham gia vote. Tải lại trang để cập nhật.</div>
      </Shell>
    );
  }
  return (
    <Shell title="Đăng nhập" cta="Đăng nhập với Google" err={err} busy={busy} onSubmit={go}>
      {reason && <div className="info">{reason}</div>}
      <div className="lead" style={{ fontSize: 13 }}>
        Đăng nhập bằng tài khoản Google. Tài khoản mới sẽ chờ Ban tổ chức duyệt; trong lúc chờ bạn vẫn xem được thông tin giải đấu.
      </div>
    </Shell>
  );
}

/**
 * The signed-in user's profile: their player card + stats (read-only) and a photo picker
 * that previews on the card before saving. Only the photo is user-editable; stats belong to staff.
 */
function MeForm() {
  const { me, snap, run, closeModal, openModal } = useLeague();
  const { tm } = useAccess();
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  if (!me) return null;
  const player = snap?.players.find((p) => p.userId === me.id);
  const team = tm(player ? player.teamId : null);
  const current = player?.photo || me.avatar || null;
  const shown = preview?.url ?? current;
  const L = player?.pos === 'GK' ? LBL_GK : LBL;
  const col = (v: number) => (v >= 85 ? '#c6ff3d' : v >= 75 ? '#f5c542' : v >= 65 ? '#ff9f43' : '#ff6b81');

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try { const blob = await readImg(file, 360, 'image/jpeg'); setPreview({ blob, url: URL.createObjectURL(blob) }); }
    catch { setErr('Không đọc được ảnh. Hãy chọn file JPG hoặc PNG.'); }
  };
  const save = async (blob: Blob | null) => {
    setBusy(true); setErr('');
    try { await run(() => api.setMyPhoto(blob), blob ? 'Đã cập nhật ảnh' : 'Đã dùng lại ảnh Google', true); setPreview(null); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Shell title="Hồ sơ của tôi" err={err} busy={busy} onSubmit={() => {}}>
      <div className="me-top">
        {player
          ? <div className="me-card"><PlayerCard p={{ ...player, photo: shown }} team={team} still /></div>
          : <div className="ph" style={{ width: 110, height: 110, borderRadius: '50%', background: shown ? `center/cover url("${shown}")` : 'rgba(255,255,255,.05)' }}>{shown ? '' : ini(me.name)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          <NameEdit name={me.name} changedAt={me.nameChangedAt} />
          <div className="lead" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{me.email}</div>
          <div className="lead" style={{ fontSize: 12, color: '#c6ff3d' }}>{ROLE_LABEL[me.role]}{me.team ? ' · ' + tm(me.team).name : ''}</div>
          {player && <div className="lead" style={{ fontSize: 12 }}>⚽ {team.id ? team.name : 'Cầu thủ tự do'} · #{player.num} · {player.pos}</div>}
          {player && <NumberEdit current={player.num} playerId={player.id} />}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {!preview && <label className="ph-btn">Đổi ảnh<input type="file" accept="image/*" onChange={pick} disabled={busy} /></label>}
            {preview && <button type="button" className="ph-btn" style={{ background: '#c6ff3d', color: '#06080d' }} disabled={busy} onClick={() => save(preview.blob)}>{busy ? 'Đang lưu…' : 'Lưu ảnh'}</button>}
            {preview && <button type="button" className="ph-btn grey" disabled={busy} onClick={() => setPreview(null)}>Hủy</button>}
            {!preview && <button type="button" className="ph-btn grey" disabled={busy} onClick={() => save(null)}>Dùng ảnh Google</button>}
          </div>
          {preview && <div className="fm-note" style={{ color: '#e4ff9a' }}>Đang xem trước — bấm Lưu ảnh để áp dụng.</div>}
        </div>
      </div>

      {player ? (
        <>
          <div className="cm-info">
            {[{ l: 'OVR', v: player.ovr, c: '#c6ff3d' }, { l: 'TUỔI', v: player.age, c: '#fff' }, { l: 'CHÂN', v: player.foot, c: '#fff' }, { l: 'GIÁ TRỊ', v: money(player.value), c: '#f5c542' }]
              .map((i) => <div key={i.l}><span>{i.l}</span><b style={{ color: i.c }}>{i.v}</b></div>)}
          </div>
          <div className="cm-bars">
            {player.stats.map((v, j) => (
              <div key={j} className="cm-bar">
                <span>{L[j]}</span>
                <div><div style={{ width: v + '%', background: col(v), animationDelay: 0.1 + j * 0.05 + 's' }} /></div>
                <b style={{ color: col(v) }}>{v}</b>
              </div>
            ))}
          </div>
          <PositionEdit key={player.positions.join()} player={player} />
          <div className="fm-note">Bạn tự đổi được ảnh, số áo và vị trí sở trường. Chỉ số do Chủ tịch / BHL của đội hoặc Ban tổ chức cập nhật; OVR hệ thống tự tính theo vị trí chính và chỉ số.</div>
        </>
      ) : (
        <div className="fm-note">{me.role === 'pending' ? 'Tài khoản đang chờ Ban tổ chức duyệt. ' : ''}Bạn chưa có hồ sơ cầu thủ — khi được duyệt làm cầu thủ, thẻ cầu thủ sẽ dùng ảnh này.</div>
      )}
      {(me.role === 'chair' || me.role === 'coach') && me.team && <TeamLogoBox teamId={me.team} />}
      {me.role === 'chair' && me.team && <button type="button" className="ph-btn grey" style={{ alignSelf: 'flex-start' }} onClick={() => openModal({ kind: 'handover', teamId: me.team! })}>Bàn giao Chủ tịch…</button>}
      <button type="button" className="cm-btn close" style={{ alignSelf: 'flex-end' }} onClick={closeModal}>Đóng</button>
    </Shell>
  );
}

/** A player changes their own jersey number (unique across the league, 0–999). */
/** Own display name; the server allows one change every 24 hours. */
function NameEdit({ name, changedAt }: { name: string; changedAt: string | null }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(name);
  const { act, pending, busy } = useAction();
  const next = changedAt ? new Date(new Date(changedAt).getTime() + 864e5) : null;
  const locked = !!next && next.getTime() > Date.now();
  const clean = v.trim().replace(/\s+/g, ' ');
  const ok = clean.length >= 2 && clean.length <= 40 && clean !== name;
  const save = () => { if (ok && !busy) act('name', async () => { await api.setMyName(clean); setEdit(false); }, 'Đã đổi tên thành ' + clean); };
  if (!edit) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ font: "italic 800 24px/1 'Barlow Condensed',sans-serif", color: '#fff', textTransform: 'uppercase', overflowWrap: 'anywhere' }}>{name}</div>
        {locked
          ? <span className="lead" style={{ fontSize: 11 }} title="Mỗi 24 giờ được đổi tên 1 lần">✎ đổi lại sau {fTime(next!.toISOString())} {fDate(next!.toISOString())}</span>
          : <button type="button" className="ph-btn grey" onClick={() => { setV(name); setEdit(true); }}>✎ Đổi tên</button>}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <input className="inp" style={{ flex: '1 1 160px', padding: '8px 10px', fontSize: 15 }} value={v} maxLength={40} autoFocus aria-label="Tên hiển thị"
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
        <button type="button" className="ph-btn" disabled={!ok || busy} onClick={save}>{pending ? <><Spin />Đang lưu…</> : 'Lưu'}</button>
        <button type="button" className="ph-btn grey" disabled={busy} onClick={() => setEdit(false)}>Hủy</button>
      </div>
      <div className="fm-note" style={{ color: '#e4ff9a' }}>Tên mới hiện trên thẻ cầu thủ và trang đội. Sau khi đổi phải chờ <span>24 giờ</span> mới đổi lại được.</div>
    </div>
  );
}

function NumberEdit({ current, playerId }: { current: number; playerId: string }) {
  const { snap } = useLeague();
  const [v, setV] = useState(String(current));
  const { act, pending, busy } = useAction(1500);
  const n = v === '' ? null : +v;
  const taken = n != null ? snap!.players.find((x) => x.num === n && x.id !== playerId) : undefined;
  const changed = n != null && n !== current;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="lead" style={{ fontSize: 12 }}>Số áo</span>
      <input className="inp" style={{ width: 76, padding: '7px 10px', fontSize: 14 }} inputMode="numeric" value={v} aria-label="Số áo"
        onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 3))} />
      {changed && !taken && <button type="button" className="ph-btn" disabled={busy} onClick={() => act('num', () => api.setMyNumber(n!), `Đã đổi số áo thành #${n}`)}>{pending ? <><Spin />Đang lưu…</> : 'Đổi số'}</button>}
      {taken && <span className="err" style={{ fontSize: 11 }}>#{n} đã có: {taken.name}</span>}
    </div>
  );
}

/** A player chooses their own 1–3 positions; previews the OVR the server will compute. */
function PositionEdit({ player }: { player: Player }) {
  const [v, setV] = useState<Pos[]>(player.positions);
  const { act, pending, busy } = useAction(1500);
  const changed = v.join() !== player.positions.join();
  const next = v[0] ? ovrOf(v[0], player.stats) : null;
  return (
    <div className="stat-box">
      <div className="stat-box-h"><span>VỊ TRÍ SỞ TRƯỜNG</span><span style={{ letterSpacing: 0 }}>tối đa 3 · vị trí đầu là vị trí chính</span></div>
      <PositionPicker value={v} onChange={setV} />
      {changed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {next != null && <span className="note">OVR mới: <b style={{ color: '#c6ff3d' }}>{next}</b> (hiện tại {player.ovr})</span>}
          <button type="button" className="ph-btn" disabled={busy || !v.length} onClick={() => act('pos', () => api.setMyPositions(v), 'Đã cập nhật vị trí')}>{pending ? <><Spin />Đang lưu…</> : 'Lưu vị trí'}</button>
          <button type="button" className="ph-btn grey" disabled={busy} onClick={() => setV(player.positions)}>Hủy</button>
        </div>
      )}
    </div>
  );
}

/** Chairman hands the role to a player (with an account) or the BHL of their team. */
function HandoverForm({ teamId }: { teamId: string }) {
  const { snap, user } = useLeague();
  const { tm } = useAccess();
  const d = snap!;
  const team = tm(teamId);
  const inTeam = new Set(d.players.filter((p) => p.teamId === teamId && p.userId).map((p) => p.userId!));
  const candidates = d.members.filter((m) => m.id !== user?.id && m.role !== 'pending' && m.role !== 'admin'
    && ((m.role === 'coach' && m.team === teamId) || (inTeam.has(m.id) && m.role !== 'coach')));
  const [pick, setPick] = useState('');
  const [sure, setSure] = useState(false);
  const { err, setErr, busy, submit } = useSubmit();
  const target = candidates.find((m) => m.id === pick);
  return (
    <Shell title="Bàn giao Chủ tịch" cta="Bàn giao" err={err} busy={busy} onSubmit={() => {
      if (!target) return setErr('Chọn người nhận.');
      if (!sure) return setErr('Tick xác nhận trước khi bàn giao.');
      submit(() => api.handoverChair(target.id), `${target.name} là Chủ tịch mới của ${team.short}`);
    }}>
      <div className="lead" style={{ fontSize: 13 }}>Chọn một cầu thủ hoặc BHL của <b style={{ color: '#fff' }}>{team.name}</b>. Sau khi bàn giao bạn trở thành Thành viên (vẫn là cầu thủ của đội) và mất quyền Chủ tịch.</div>
      {!candidates.length && <div className="note">Đội chưa có cầu thủ nào có tài khoản để nhận bàn giao.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {candidates.map((m) => {
          const pl = d.players.find((p) => p.userId === m.id);
          return (
            <button type="button" key={m.id} className="dest" style={{ justifyContent: 'space-between', borderColor: pick === m.id ? '#c6ff3d' : undefined }} onClick={() => setPick(m.id)}>
              <span>{m.name}</span>
              <span className="note">{m.role === 'coach' ? 'BHL' : 'Cầu thủ'}{pl ? ` · #${pl.num} ${pl.pos}` : ''}</span>
            </button>
          );
        })}
      </div>
      {target && (
        <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={sure} onChange={(e) => { setSure(e.target.checked); setErr(''); }} style={{ accentColor: '#c6ff3d', width: 18, height: 18 }} />
          <span style={{ fontSize: 13, color: '#fff' }}>Tôi xác nhận bàn giao Chủ tịch {team.short} cho {target.name}</span>
        </label>
      )}
    </Shell>
  );
}

/** Chairman / BHL: change the team logo with a preview on the crest. */
function TeamLogoBox({ teamId }: { teamId: string }) {
  const { tm } = useAccess();
  const { act, pending, busy } = useAction();
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const team = tm(teamId);
  const shown = preview ? { ...team, logo: preview.url } : team;
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try { const blob = await readImg(file, 256, 'image/png'); setPreview({ blob, url: URL.createObjectURL(blob) }); }
    catch { setErr('Không đọc được ảnh. Hãy chọn file JPG hoặc PNG.'); }
  };
  return (
    <div className="stat-box" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <Crest team={shown} style={{ width: 64, height: 72, fontSize: 26 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 180 }}>
        <div style={{ font: "italic 800 18px/1 'Barlow Condensed',sans-serif", color: '#fff', textTransform: 'uppercase' }}>Logo {team.name}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {!preview && <label className="ph-btn">Đổi logo đội<input type="file" accept="image/*" onChange={pick} disabled={busy} /></label>}
          {preview && <button type="button" className="ph-btn" style={{ background: '#c6ff3d', color: '#06080d' }} disabled={busy}
            onClick={() => act('logo', () => api.setTeamLogo(teamId, preview.blob), 'Đã cập nhật logo ' + team.short).then(() => setPreview(null))}>{pending ? <><Spin />Đang lưu…</> : 'Lưu logo'}</button>}
          {preview && <button type="button" className="ph-btn grey" disabled={busy} onClick={() => setPreview(null)}>Hủy</button>}
          {!preview && team.logo && <button type="button" className="ph-btn grey" disabled={busy} onClick={() => act('rm', () => api.setTeamLogo(teamId, null), 'Đã gỡ logo')}>Gỡ logo</button>}
        </div>
        {preview && <div className="fm-note" style={{ color: '#e4ff9a' }}>Đang xem trước — bấm Lưu logo để áp dụng.</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}

/** A player's notifications: invitations (they answer) and offers about them (their chairman decides). */
function InboxForm() {
  const { snap } = useLeague();
  const { tm, myPlayer } = useAccess();
  const { act, pending, busy } = useAction();
  if (!myPlayer) return null;
  const list = snap!.offers.filter((o) => o.pid === myPlayer.id)
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const ST: Record<string, [string, string]> = { pending: ['CHỜ', '#f5c542'], accepted: ['ĐÃ ĐỒNG Ý', '#4ade80'], rejected: ['TỪ CHỐI', '#ff6b81'], cancelled: ['ĐÃ HỦY', '#8b93a7'] };
  return (
    <Shell title="Thông báo" err="" busy={busy} onSubmit={() => {}}>
      {!list.length && <div className="note" style={{ fontSize: 13 }}>Chưa có lời mời hay đề nghị chuyển nhượng nào liên quan đến bạn.</div>}
      {list.map((o) => {
        const buyer = tm(o.from);
        const invite = !o.to;
        const pend = o.status === 'pending';
        return (
          <div key={o.id} className={'rq-item' + (pend ? ' pend' : '')} style={{ animation: 'none' }}>
            <div className="row-sb">
              <div style={{ font: "600 14px/1.35 'Be Vietnam Pro',sans-serif", color: '#fff' }}>
                {invite
                  ? <><b style={{ color: buyer.color }}>{buyer.name}</b> mời bạn gia nhập đội</>
                  : <><b style={{ color: buyer.color }}>{buyer.name}</b> đề nghị mua bạn từ {tm(o.to).short} · <span style={{ color: '#f5c542' }}>{money(o.price)}</span></>}
              </div>
              <span className="st" style={{ background: 'rgba(255,255,255,.06)', color: ST[o.status][1] }}>{ST[o.status][0]}</span>
            </div>
            {o.note && <div className="quote">“{o.note}”</div>}
            <div className="meta">{o.byName} · {dmy(o.date)}</div>
            {pend && invite && (
              <div className="acts">
                <button type="button" className="btn-ok" disabled={busy} onClick={() => act('ok:' + o.id, () => api.respondOffer(o.id, true), (m) => m as string)}>{pending === 'ok:' + o.id ? <><Spin />Đang xử lý…</> : 'Đồng ý'}</button>
                <button type="button" className="btn-no" disabled={busy} onClick={() => act('no:' + o.id, () => api.respondOffer(o.id, false), (m) => m as string)}>{pending === 'no:' + o.id ? <><Spin />Đang xử lý…</> : 'Từ chối'}</button>
              </div>
            )}
            {pend && !invite && <div className="note">Chủ tịch {tm(o.to).short} sẽ quyết định đề nghị này — bạn chỉ nhận thông báo.</div>}
          </div>
        );
      })}
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

/** Choose 1–3 positions; order of selection = priority (first = primary, used for OVR and lineups). */
export function PositionPicker({ value, onChange }: { value: Pos[]; onChange: (v: Pos[]) => void }) {
  return (
    <div className="opts">
      {POSS.map((x) => {
        const i = value.indexOf(x);
        const full = i < 0 && value.length >= 3;
        return (
          <button type="button" key={x} className={'opt pos-opt' + (i >= 0 ? ' on' : '')} disabled={full} title={full ? 'Đã chọn đủ 3 vị trí' : undefined}
            onClick={() => onChange(i >= 0 ? value.filter((y) => y !== x) : [...value, x])}>
            {x}{i >= 0 && <sup>{i === 0 ? 'chính' : i + 1}</sup>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Add / edit a player, or — with approveUserId — approve a pending account and create its player profile.
 * teamId null = free agent (Tự do).
 */
function PlayerForm({ playerId, teamId, approveUserId }: { playerId?: string; teamId: string | null; approveUserId?: string }) {
  const { snap, flash } = useLeague();
  const { tm } = useAccess();
  const p = playerId ? snap!.players.find((x) => x.id === playerId) : undefined;
  const acct = approveUserId ? snap!.members.find((m) => m.id === approveUserId) : undefined;
  const [f, setF] = useState(() => p
    ? { name: p.name, positions: p.positions.slice(), num: String(p.num), age: String(p.age), foot: p.foot, ovr: p.ovr, stats: p.stats.slice(), photo: p.photo || '' }
    : { name: acct?.name || '', positions: ['CM'] as Pos[], num: String(nextFreeNum(snap!.players)), age: '25', foot: 'Phải' as Foot, ovr: 65, stats: genStats('CM', 65, Date.now() % 997), photo: acct?.avatar || '' });
  const [joinTeam, setJoinTeam] = useState<string>(teamId || '');
  // Approval: staff role (independent of being a player) and whether to create a player profile.
  const hasPlayer = !!acct && snap!.players.some((x) => x.userId === acct.id);
  const [role, setRole] = useState<Role>(acct && acct.role !== 'pending' ? acct.role : 'member');
  const [roleTeam, setRoleTeam] = useState<string>(acct?.team || snap!.teams[0]?.id || '');
  const [makePlayer, setMakePlayer] = useState(!hasPlayer);
  const staffRole = role === 'chair' || role === 'coach';
  const [uploading, setUploading] = useState(false);
  const { err, setErr, busy, submit } = useSubmit();
  const team = tm(p ? p.teamId : approveUserId ? (staffRole ? roleTeam : joinTeam) || null : teamId);
  const primary = f.positions[0];
  const L = primary === 'GK' ? LBL_GK : LBL;
  const ovr = primary ? ovrOf(primary, f.stats) : 0;
  const numTaken = f.num !== '' ? snap!.players.find((x) => x.num === +f.num && x.id !== p?.id) : undefined;
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
    <Shell title={acct ? (acct.role === 'pending' ? 'Duyệt thành viên' : 'Tạo hồ sơ cầu thủ') : p ? 'Chỉnh sửa cầu thủ' : 'Thêm cầu thủ'} cta={acct ? (acct.role === 'pending' ? 'Duyệt' : 'Lưu') + (makePlayer ? ' & tạo cầu thủ' : '') : p ? 'Lưu thay đổi' : 'Đăng ký'} err={err} busy={busy || uploading} onSubmit={() => {
      if (!f.name.trim()) return setErr('Nhập tên cầu thủ.');
      if (!primary) return setErr('Chọn ít nhất 1 vị trí.');
      if (f.num === '') return setErr('Nhập số áo (0–999).');
      if (numTaken && (!p || +f.num !== p.num)) return setErr(`Số áo ${f.num} đã có người dùng (${numTaken.name}).`);
      const input = {
        teamId: team.id || null, name: f.name, pos: primary, positions: f.positions, ovr, foot: f.foot, stats: f.stats, photo: f.photo || null,
        num: +f.num, age: +f.age || p?.age || 25,
      };
      if (acct) {
        const staffTeam = role === 'chair' || role === 'coach' ? roleTeam || null : null;
        if ((role === 'chair' || role === 'coach') && !staffTeam) return setErr('Chọn đội cho Chủ tịch / BHL.');
        const what = [role !== 'member' ? ROLE_LABEL[role] + (staffTeam ? ' ' + tm(staffTeam).short : '') : '', makePlayer ? 'cầu thủ ' + (team.id ? team.short : 'tự do') : ''].filter(Boolean).join(' · ') || 'Thành viên';
        return submit(() => api.approveMember(acct.id, role, staffTeam, makePlayer ? input : null), `Đã duyệt ${f.name.trim()} · ${what}`);
      }
      submit(() => api.savePlayer({ id: p?.id, ...input }), (p ? 'Đã cập nhật ' : 'Đã đăng ký ') + f.name.trim());
    }}>
      {acct && <div className="info">Tài khoản <b>{acct.email}</b>. Một người có thể vừa giữ vai trò quản lý (Chủ tịch / BHL / Ban tổ chức) vừa là cầu thủ.</div>}
      {acct && (
        <div className="g2">
          <label className="fld">Vai trò quản lý
            <select className="inp" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(['member', 'coach', 'chair', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{r === 'member' ? 'Không (Thành viên)' : ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="fld">Đội quản lý
            <select className="inp" value={role === 'chair' || role === 'coach' ? roleTeam : ''} disabled={!(role === 'chair' || role === 'coach')} onChange={(e) => setRoleTeam(e.target.value)}>
              {!(role === 'chair' || role === 'coach') && <option value="">—</option>}
              {snap!.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {acct && role === 'chair' && <div className="fm-note">Mỗi đội có một Chủ tịch — Chủ tịch hiện tại của đội (nếu có) sẽ về Thành viên. Chủ tịch có toàn bộ quyền của BHL.</div>}
      {acct && (
        hasPlayer
          ? <div className="fm-note">Tài khoản này đã có hồ sơ cầu thủ.</div>
          : <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={makePlayer} onChange={(e) => setMakePlayer(e.target.checked)} style={{ accentColor: '#c6ff3d', width: 18, height: 18 }} />
              <span style={{ fontSize: 13, color: '#fff' }}>Tạo hồ sơ cầu thủ</span>
            </label>
      )}
      {acct && makePlayer && (
        <label className="fld">Đội thi đấu{staffRole && <span className="note" style={{ fontSize: 11 }}>Chủ tịch / BHL luôn thi đấu cho đội mình quản lý</span>}
          <select className="inp" value={staffRole ? roleTeam : joinTeam} disabled={staffRole} onChange={(e) => setJoinTeam(e.target.value)}>
            <option value="">Tự do (các đội tự tuyển trên thị trường)</option>
            {snap!.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      {(!acct || makePlayer) && (<>
      <div className="ph-row">
        <div className="ph" style={{ background: f.photo ? `center/cover url("${f.photo}")` : 'rgba(255,255,255,.05)' }}>{f.photo ? '' : f.name ? ini(f.name) : '+'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="lead" style={{ font: "500 12px/1.4 'Be Vietnam Pro',sans-serif" }}>{(p ? 'Chỉnh sửa hồ sơ · ' : acct ? 'Hồ sơ cầu thủ · ' : 'Đăng ký vào ') + team.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <label className="ph-btn">{uploading ? 'Đang tải…' : 'Tải ảnh cầu thủ'}<input type="file" accept="image/*" onChange={onPhoto} /></label>
            {f.photo && <button type="button" className="ph-btn grey" onClick={() => setF({ ...f, photo: '' })}>Gỡ ảnh</button>}
          </div>
        </div>
      </div>
      <label className="fld">Họ và tên<input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nguyễn Văn A" /></label>
      <div className="fld g8"><span>Vị trí sở trường <span className="note" style={{ fontSize: 11 }}>· tối đa 3, vị trí đầu tiên là vị trí chính</span></span><PositionPicker value={f.positions} onChange={(positions) => setF({ ...f, positions })} /></div>
      <div className="fld g8">Chân thuận<div className="opts">{(['Phải', 'Trái'] as Foot[]).map((x) => <button type="button" key={x} className={'opt vn' + (f.foot === x ? ' on' : '')} onClick={() => setF({ ...f, foot: x })}>{x}</button>)}</div></div>
      <div className="ovr-auto"><span>OVR tự tính{primary ? ` · theo vị trí ${primary}` : ''}</span><b>{primary ? ovr : '—'}</b></div>
      <div className="stat-box">
        <div className="stat-box-h"><span>CHỈ SỐ CHI TIẾT</span><span style={{ letterSpacing: 0 }}>OVR cập nhật theo chỉ số</span></div>
        {f.stats.map((v, j) => (
          <div key={j} className="stat-r">
            <span>{L[j]}</span>
            <input type="range" min={20} max={99} value={v} aria-label={L[j]} onChange={(e) => { const a = f.stats.slice(); a[j] = +e.target.value; setF({ ...f, stats: a }); }} />
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="g2">
        <label className="fld">Số áo{numTaken && <span className="err" style={{ fontSize: 11 }}>#{f.num} đã có: {numTaken.name}</span>}
          <input className="inp" type="number" min={0} max={999} value={f.num} onChange={(e) => setF({ ...f, num: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
        <label className="fld">Tuổi<input className="inp" type="number" min={10} max={80} value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /></label>
      </div>
      </>)}
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
  const { tm, staffT } = useAccess();
  const p = snap!.players.find((x) => x.id === playerId)!;
  // A free agent gets an invitation (no fee) that they accept themselves.
  const invite = !p.teamId;
  const [price, setPrice] = useState(p.value.toFixed(1));
  const [note, setNote] = useState('');
  const { err, setErr, busy, submit } = useSubmit();
  const pr = +price || 0;
  const df = Math.round((pr / p.value - 1) * 100);
  const seller = tm(p.teamId);
  const t = tier(p.ovr);
  return (
    <Shell title={invite ? 'Mời cầu thủ tự do' : 'Đề nghị mua cầu thủ'} cta={invite ? 'Gửi lời mời' : 'Gửi yêu cầu chuyển nhượng'} err={err} busy={busy} onSubmit={() => {
      if (invite) return submit(() => api.makeOffer(p.id, 0, note), 'Đã gửi lời mời tới ' + p.name, closeCard);
      if (!(pr > 0)) return setErr('Nhập giá đề nghị hợp lệ.');
      submit(() => api.makeOffer(p.id, pr, note), 'Đã gửi đề nghị tới Chủ tịch ' + seller.short, closeCard);
    }}>
      <div className="pbox">
        <div className="badge" style={{ background: t.bg, color: t.fg }}>{p.ovr}</div>
        <div><span>{p.name}</span><span>{p.pos} · {seller.name}</span></div>
      </div>
      {!invite && <>
      <div className="g2">
        <div className="pricebox"><span>GIÁ HIỆN TẠI</span><b>{money(p.value)}</b></div>
        <div className="pricebox gold"><span>GIÁ ĐỀ NGHỊ</span><b>{money(pr)}</b></div>
      </div>
      <label className="fld"><span style={{ display: 'flex', justifyContent: 'space-between' }}>Giá mong muốn (tỷ)<span style={{ color: df >= 0 ? '#4ade80' : '#ff6b81' }}>{pr ? (df > 0 ? '+' : '') + df + '% so với định giá' : ''}</span></span>
        <input className="inp money" type="number" step="0.1" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <div className="opts">{([['-10%', 0.9], ['Bằng giá', 1], ['+10%', 1.1], ['+25%', 1.25]] as [string, number][]).map(([l, k]) => <button type="button" key={l} className="opt q" onClick={() => setPrice((p.value * k).toFixed(1))}>{l}</button>)}</div>
      </>}
      <label className="fld">{invite ? 'Lời nhắn cho cầu thủ' : 'Lời nhắn cho chủ tịch'}<textarea className="inp" rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="VD: Cần tăng cường hàng công cho mùa giải..." /></label>
      {invite
        ? <div className="fm-note">Lời mời từ <span>{staffT ? tm(staffT).name : ''}</span> sẽ được gửi tới <span>{p.name}</span>. Cầu thủ đồng ý là về đội ngay, không mất phí.</div>
        : <div className="fm-note">Yêu cầu từ <span>{staffT ? tm(staffT).name : ''}</span> sẽ được gửi tới Chủ tịch <span>{seller.chair.name}</span> để duyệt. <span>{p.name}</span> cũng nhận được thông báo nhưng không tự quyết định.</div>}
    </Shell>
  );
}

const CANCEL_REASONS = ['Thiếu người', 'Trời mưa', 'Sân không sử dụng được', 'Khác'];

/** Cancel an upcoming match with a reason (admin or either chairman). */
function CancelMatchForm({ matchId }: { matchId: string }) {
  const { snap } = useLeague();
  const { tm } = useAccess();
  const m = snap!.matches.find((x) => x.id === matchId)!;
  const [why, setWhy] = useState(CANCEL_REASONS[0]);
  const [note, setNote] = useState('');
  const { err, setErr, busy, submit } = useSubmit();
  const series = m.seriesId ? snap!.series.find((s) => s.id === m.seriesId) : undefined;
  return (
    <Shell title="Hủy trận đấu" cta="Xác nhận hủy trận" err={err} busy={busy} onSubmit={() => {
      const reason = [why === 'Khác' ? '' : why, note.trim()].filter(Boolean).join(' · ');
      if (!reason) return setErr('Nhập lý do hủy trận.');
      submit(() => api.cancelMatch(m.id, reason), `Đã hủy trận ${tm(m.home).short} vs ${tm(m.away).short}`);
    }}>
      <div className="lead" style={{ fontSize: 13 }}>{tm(m.home).name} vs {tm(m.away).name} · {fDate(m.date)} · {fTime(m.date)}</div>
      <div className="fld g8">Lý do<div className="opts">{CANCEL_REASONS.map((r) => <button type="button" key={r} className={'opt vn' + (why === r ? ' on' : '')} onClick={() => setWhy(r)}>{r}</button>)}</div></div>
      <label className="fld">{why === 'Khác' ? 'Lý do cụ thể' : 'Ghi chú thêm (không bắt buộc)'}<input className="inp" maxLength={150} value={note} onChange={(e) => setNote(e.target.value)} placeholder={why === 'Trời mưa' ? 'VD: mưa to, sân ngập' : ''} /></label>
      <div className="fm-note">Mọi người sẽ thấy trận ở trạng thái <span>ĐÃ HỦY</span> kèm lý do; đăng ký và vote của trận bị đóng.{series?.active ? ' Trận tuần sau của lịch cố định sẽ được tạo tự động.' : ''}</div>
    </Shell>
  );
}

/** Admin: create or edit a tournament from the S7 / S5 template. */
function TournamentForm({ id }: { id?: string }) {
  const { snap, go } = useLeague();
  const T = snap!.teams;
  const t = id ? snap!.tournaments.find((x) => x.id === id) : undefined;
  const [f, setF] = useState<TournamentInput>(() => t
    ? { name: t.name, format: t.format, structure: t.structure, groupCount: t.groupCount, startsOn: t.startsOn, endsOn: t.endsOn, settings: t.settings, rulesMd: t.rulesMd, teamIds: t.teams.map((x) => x.teamId) }
    : { name: `Giải Sân 7 Nội Bộ ${new Date().getFullYear()}`, format: 's7', structure: 'league', groupCount: 2, startsOn: null, endsOn: null,
        settings: TEMPLATES.s7, rulesMd: rulesTemplate('s7', TEMPLATES.s7, `Giải Sân 7 Nội Bộ ${new Date().getFullYear()}`), teamIds: [] });
  const { err, setErr, busy, submit } = useSubmit();
  const set = <K extends keyof TournamentInput>(k: K, v: TournamentInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const setS = (patch: Partial<TournamentInput['settings']>) => setF((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const setPts = (k: keyof TournamentInput['settings']['pts'], v: number) => setF((x) => ({ ...x, settings: { ...x.settings, pts: { ...x.settings.pts, [k]: v } } }));
  const useTemplate = (fmt: 's5' | 's7') => {
    const court = fmt === 's5' ? 'Sân 5' : 'Sân 7';
    const name = /Giải Sân [57]/.test(f.name) || !f.name.trim() ? f.name.replace(/Sân [57]/, court) || `Giải ${court} Nội Bộ` : f.name;
    setF((x) => ({ ...x, format: fmt, name, settings: TEMPLATES[fmt], rulesMd: rulesTemplate(fmt, TEMPLATES[fmt], name) }));
  };
  const n = f.teamIds.length;
  const num = (label: string, v: number, on: (n: number) => void, min = -9, max = 99) => (
    <label className="fld" style={{ minWidth: 0 }}>{label}<input className="inp" type="number" min={min} max={max} value={v} onChange={(e) => on(+e.target.value)} /></label>
  );
  return (
    <Shell title={t ? 'Sửa giải đấu' : 'Tạo giải đấu'} cta={t ? 'Lưu thay đổi' : n > 2 ? 'Tạo giải & bốc thăm' : n ? 'Tạo giải đấu' : 'Đăng giải & mở đăng ký'} err={err} busy={busy} onSubmit={() => {
      if (!f.name.trim()) return setErr('Nhập tên giải.');
      if (t) return submit(() => api.updateTournament(t.id, { ...f, teamIds: f.teamIds.join() === t.teams.map((x) => x.teamId).join() ? undefined : f.teamIds }), 'Đã cập nhật giải đấu');
      let newId = '';
      submit(async () => { newId = await api.createTournament(f); }, n > 2 ? 'Đã tạo giải và bốc thăm' : 'Đã tạo giải đấu', () => go({ view: 'tournament', id: newId }));
    }}>
      {!t && (
        <div className="fld g8">Template
          <div className="g2">
            {(['s7', 's5'] as const).map((fmt) => (
              <button type="button" key={fmt} className={'tpl' + (f.format === fmt ? ' on' : '')} onClick={() => useTemplate(fmt)}>
                <b>{fmt === 's7' ? 'SÂN 7' : 'SÂN 5'}</b><span>{TEMPLATES[fmt].starters} đá chính · {TEMPLATES[fmt].squadMin}–{TEMPLATES[fmt].squadMax} người · {TEMPLATES[fmt].halves}×{TEMPLATES[fmt].halfMin}′</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="fld">Tên giải<input className="inp" value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} /></label>
      <div className="fld g8">Đội tham gia · {n}
        <div className="note">{t ? 'Chủ tịch các đội tự đăng ký khi giải còn "Sắp khởi tranh"; BTC có thể thêm/bớt đội tại đây.' : 'Để trống để mở đăng ký: Chủ tịch các đội sẽ thấy nút “Đăng ký tham gia”. Hoặc chọn sẵn đội.'}</div>
        <div className="opts">
          {T.map((x) => {
            const on = f.teamIds.includes(x.id);
            return <button type="button" key={x.id} className={'opt vn' + (on ? ' on' : '')} onClick={() => set('teamIds', on ? f.teamIds.filter((y) => y !== x.id) : [...f.teamIds, x.id])}>{x.short} · {x.name}</button>;
          })}
        </div>
      </div>
      <div className="g2">
        <label className="fld">Thể thức
          <select className="inp" value={f.structure} onChange={(e) => set('structure', e.target.value as TournamentInput['structure'])}>
            {(Object.keys(STRUCTURE_LABEL) as (keyof typeof STRUCTURE_LABEL)[]).map((k) => <option key={k} value={k} disabled={k !== 'league' && n > 0 && n <= 2}>{STRUCTURE_LABEL[k]}</option>)}
          </select>
        </label>
        {f.structure === 'groups'
          ? num('Số bảng', f.groupCount, (v) => set('groupCount', Math.max(1, Math.min(8, v))), 1, 8)
          : <div className="fld"><span>Bốc thăm</span><div className="note" style={{ paddingTop: 10 }}>{n > 2 ? (f.structure === 'knockout' ? 'Xếp nhánh ngẫu nhiên' : 'Xếp thứ tự ngẫu nhiên') : n === 2 ? '2 đội: đá vòng tròn hằng tuần' : 'Bốc thăm sau khi các đội đăng ký'}</div></div>}
      </div>
      <div className="g2">
        <label className="fld">Ngày khai mạc<input className="inp" type="date" value={f.startsOn || ''} onChange={(e) => set('startsOn', e.target.value || null)} /></label>
        <label className="fld">Ngày bế mạc<input className="inp" type="date" value={f.endsOn || ''} onChange={(e) => set('endsOn', e.target.value || null)} /></label>
      </div>
      <div className="stat-box">
        <div className="stat-box-h"><span>THÔNG SỐ GIẢI</span><button type="button" onClick={() => set('rulesMd', rulesTemplate(f.format, f.settings, f.name))}>Cập nhật thể lệ theo thông số</button></div>
        <div className="g3">
          {num('Số tuần', f.settings.weeks, (v) => setS({ weeks: v }), 1, 60)}
          {num('Số chặng', f.settings.stages, (v) => setS({ stages: v }), 1, 6)}
          {num('Đá chính', f.settings.starters, (v) => setS({ starters: v }), 3, 11)}
          {num('Quân số tối thiểu', f.settings.squadMin, (v) => setS({ squadMin: v }), 3, 30)}
          {num('Quân số tối đa', f.settings.squadMax, (v) => setS({ squadMax: v }), 3, 30)}
          <label className="fld">Phút/hiệp<input className="inp" value={f.settings.halfMin} onChange={(e) => setS({ halfMin: e.target.value })} /></label>
          {num('Thắng', f.settings.pts.win, (v) => setPts('win', v))}
          {num('Hòa', f.settings.pts.draw, (v) => setPts('draw', v))}
          {num('Thua sát nút +', f.settings.pts.closeLossBonus, (v) => setPts('closeLossBonus', v))}
        </div>
      </div>
      <label className="fld">Thể lệ chi tiết (Markdown)
        <textarea className="inp" rows={10} value={f.rulesMd} onChange={(e) => set('rulesMd', e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
      </label>
      {t && f.teamIds.join() !== t.teams.map((x) => x.teamId).join() && <div className="fm-note">Danh sách đội thay đổi → hệ thống sẽ <span>bốc thăm lại</span>.</div>}
    </Shell>
  );
}

function ScheduleForm() {
  const { snap } = useLeague();
  const T = snap!.teams;
  const t = new Date(Date.now() + 14 * 864e5);
  const [f, setF] = useState({ home: T[0]?.id || '', away: (T[1] || T[0])?.id || '', date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T19:30`, venue: DEFAULT_VENUE });
  const [weekly, setWeekly] = useState(false);
  const active = snap!.tournaments.find((x) => x.status !== 'finished');
  const [tourId, setTourId] = useState(active?.id || '');
  const [stage, setStage] = useState('');
  const when = f.date ? new Date(f.date) : null;
  const { err, setErr, busy, submit } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Shell title="Lên lịch thi đấu" cta="Tạo trận đấu" err={err} busy={busy} onSubmit={() => {
      if (!f.home || !f.away || f.home === f.away) return setErr('Chọn hai đội khác nhau.');
      if (!f.date) return setErr('Chọn thời gian.');
      submit(() => api.scheduleMatch({ ...f, venue: f.venue.trim() || DEFAULT_VENUE, weekly, tournamentId: tourId || null, stage }), weekly ? 'Đã tạo lịch cố định hằng tuần' : 'Đã lên lịch trận đấu');
    }}>
      <div className="g2">
        <label className="fld">Đội nhà<select className="inp" value={f.home} onChange={set('home')}>{T.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="fld">Đội khách<select className="inp" value={f.away} onChange={set('away')}>{T.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <label className="fld">Thời gian<input className="inp" type="datetime-local" value={f.date} onChange={set('date')} /></label>
      <label className="fld">Sân thi đấu<input className="inp" value={f.venue} onChange={set('venue')} /></label>
      {snap!.tournaments.some((x) => x.status !== 'finished') && (
        <div className="g2">
          <label className="fld">Thuộc giải đấu
            <select className="inp" value={tourId} onChange={(e) => setTourId(e.target.value)}>
              <option value="">— Giao hữu —</option>
              {snap!.tournaments.filter((x) => x.status !== 'finished').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="fld">Vòng / bảng<input className="inp" value={stage} maxLength={40} placeholder="VD: Bảng A, Bán kết" onChange={(e) => setStage(e.target.value)} disabled={!tourId} /></label>
        </div>
      )}
      <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} style={{ accentColor: '#c6ff3d', width: 18, height: 18 }} />
        <span style={{ fontSize: 13, color: '#fff' }}>Lặp lại hằng tuần{weekly && when ? ` · ${['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][when.getDay()]} ${pad(when.getHours())}:${pad(when.getMinutes())}` : ''}</span>
      </label>
      {weekly && <div className="fm-note">Khi trận gần nhất kết thúc (đã nhập kết quả, bị hủy, hoặc quá giờ đá 2 tiếng), hệ thống tự tạo trận tuần sau cùng thứ, giờ và sân. Dừng lặp lại trong trang trận đấu.</div>}
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
    case 'me': return <MeForm />;
    case 'inbox': return <InboxForm />;
    case 'approve': return snap?.members.some((x) => x.id === m.userId && !snap.players.some((p) => p.userId === x.id)) ? <PlayerForm key={m.userId} teamId={null} approveUserId={m.userId} /> : null;
    case 'player': return !m.playerId || snap?.players.some((p) => p.id === m.playerId) ? <PlayerForm key={m.playerId || 'new'} playerId={m.playerId} teamId={m.teamId} /> : null;
    case 'transfer': return snap?.players.some((p) => p.id === m.playerId) ? <TransferForm playerId={m.playerId} /> : null;
    case 'offer': return snap?.players.some((p) => p.id === m.playerId) ? <OfferForm playerId={m.playerId} /> : null;
    case 'schedule': return <ScheduleForm />;
    case 'tournament': return <TournamentForm key={m.id || 'new'} id={m.id} />;
    case 'handover': return <HandoverForm teamId={m.teamId} />;
    case 'cancelMatch': return snap?.matches.some((x) => x.id === m.matchId) ? <CancelMatchForm matchId={m.matchId} /> : null;
  }
}
