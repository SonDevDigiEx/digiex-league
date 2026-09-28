import { useEffect, useState, type ReactNode } from 'react';
import { Crest, PlayerCard } from '../components/bits';
import { Spin, useAction } from '../data/useAction';
import { api, useAccess, useLeague, type Modal } from '../data/store';
import { dmy, DEFAULT_VENUE, fDate, fTime, genStats, ini, ROLE_LABEL, LBL, LBL_GK, money, pad, POSS, readImg, SWATCHES, tier } from '../lib/league';
import type { Foot, Pos, Role } from '../lib/types';

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
  const { me, snap, run, closeModal } = useLeague();
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
          <div style={{ font: "italic 800 24px/1 'Barlow Condensed',sans-serif", color: '#fff', textTransform: 'uppercase' }}>{player?.name || me.name}</div>
          <div className="lead" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{me.email}</div>
          <div className="lead" style={{ fontSize: 12, color: '#c6ff3d' }}>{ROLE_LABEL[me.role]}{me.team ? ' · ' + tm(me.team).name : ''}</div>
          {player && <div className="lead" style={{ fontSize: 12 }}>⚽ {team.id ? team.name : 'Cầu thủ tự do'} · #{player.num} · {player.pos}</div>}
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
          <div className="fm-note">Bạn chỉ đổi được ảnh. Vị trí, chỉ số, số áo do Chủ tịch / BHL của đội hoặc Ban tổ chức cập nhật.</div>
        </>
      ) : (
        <div className="fm-note">{me.role === 'pending' ? 'Tài khoản đang chờ Ban tổ chức duyệt. ' : ''}Bạn chưa có hồ sơ cầu thủ — khi được duyệt làm cầu thủ, thẻ cầu thủ sẽ dùng ảnh này.</div>
      )}
      {(me.role === 'chair' || me.role === 'coach') && me.team && <TeamLogoBox teamId={me.team} />}
      <button type="button" className="cm-btn close" style={{ alignSelf: 'flex-end' }} onClick={closeModal}>Đóng</button>
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
    ? { name: p.name, pos: p.pos, num: String(p.num), age: String(p.age), foot: p.foot, ovr: p.ovr, stats: p.stats.slice(), photo: p.photo || '' }
    : { name: acct?.name || '', pos: 'CM' as Pos, num: '', age: '25', foot: 'Phải' as Foot, ovr: 65, stats: genStats('CM', 65, Date.now() % 997), photo: acct?.avatar || '' });
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
    <Shell title={acct ? (acct.role === 'pending' ? 'Duyệt thành viên' : 'Tạo hồ sơ cầu thủ') : p ? 'Chỉnh sửa cầu thủ' : 'Thêm cầu thủ'} cta={acct ? (acct.role === 'pending' ? 'Duyệt' : 'Lưu') + (makePlayer ? ' & tạo cầu thủ' : '') : p ? 'Lưu thay đổi' : 'Đăng ký'} err={err} busy={busy || uploading} onSubmit={() => {
      if (!f.name.trim()) return setErr('Nhập tên cầu thủ.');
      const input = {
        teamId: team.id || null, name: f.name, pos: f.pos, ovr: f.ovr, foot: f.foot, stats: f.stats, photo: f.photo || null,
        num: +f.num || p?.num || 99, age: +f.age || p?.age || 25,
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

function ScheduleForm() {
  const { snap } = useLeague();
  const T = snap!.teams;
  const t = new Date(Date.now() + 14 * 864e5);
  const [f, setF] = useState({ home: T[0]?.id || '', away: (T[1] || T[0])?.id || '', date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T19:30`, venue: DEFAULT_VENUE });
  const [weekly, setWeekly] = useState(false);
  const when = f.date ? new Date(f.date) : null;
  const { err, setErr, busy, submit } = useSubmit();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Shell title="Lên lịch thi đấu" cta="Tạo trận đấu" err={err} busy={busy} onSubmit={() => {
      if (!f.home || !f.away || f.home === f.away) return setErr('Chọn hai đội khác nhau.');
      if (!f.date) return setErr('Chọn thời gian.');
      submit(() => api.scheduleMatch({ ...f, venue: f.venue.trim() || DEFAULT_VENUE, weekly }), weekly ? 'Đã tạo lịch cố định hằng tuần' : 'Đã lên lịch trận đấu');
    }}>
      <div className="g2">
        <label className="fld">Đội nhà<select className="inp" value={f.home} onChange={set('home')}>{T.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="fld">Đội khách<select className="inp" value={f.away} onChange={set('away')}>{T.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <label className="fld">Thời gian<input className="inp" type="datetime-local" value={f.date} onChange={set('date')} /></label>
      <label className="fld">Sân thi đấu<input className="inp" value={f.venue} onChange={set('venue')} /></label>
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
    case 'cancelMatch': return snap?.matches.some((x) => x.id === m.matchId) ? <CancelMatchForm matchId={m.matchId} /> : null;
  }
}
