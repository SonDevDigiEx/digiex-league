// Chairman / BHL: pick a template, drag players anywhere, fill slots, save the S5 / S7 lineup.
import { useEffect, useRef, useState } from 'react';
import { Crest } from '../components/bits';
import { Pitch, Token } from '../components/Pitch';
import { api, squadOf, useAccess, useLeague } from '../data/store';
import { Spin, useAction } from '../data/useAction';
import { applyTemplate, autoFill, fit, FORMAT_LABEL, FORMATIONS, liveSlots, roleAt, SIZE, type Format, type Slot } from '../lib/formation';
import { clamp, GNAME } from '../lib/league';

export function LineupBuilder({ teamId, initial }: { teamId: string; initial?: Format }) {
  const { snap, closeModal } = useLeague();
  const { tm } = useAccess();
  const team = tm(teamId);
  const squad = squadOf(snap!.players, teamId).slice().sort((a, b) => b.ovr - a.ovr);
  const saved = (f: Format) => snap!.lineups.find((l) => l.teamId === teamId && l.format === f);
  const start = (f: Format) => {
    const l = saved(f);
    return l && l.slots.length === SIZE[f]
      ? { formation: l.formation, slots: liveSlots(l, squad) }
      : { formation: FORMATIONS[f][0], slots: autoFill(FORMATIONS[f][0], squad) };
  };
  const [format, setFormat] = useState<Format>(initial ?? (saved('s7') || !saved('s5') ? 's7' : 's5'));
  const [state, setState] = useState(() => start(format));
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const pitch = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const { act, pending, busy } = useAction(1000);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  const { formation, slots } = state;
  const set = (s: Slot[], f = formation) => { setState({ formation: f, slots: s }); setDirty(true); };
  const byId = new Map(squad.map((p) => [p.id, p]));
  const placed = new Map(slots.map((s, i) => [s.pid, i]));

  const switchFormat = (f: Format) => { if (f === format) return; setFormat(f); setState(start(f)); setSel(null); setDirty(false); };
  const pickTemplate = (f: string) => { set(applyTemplate(f, slots, squad), f); setSel(null); };

  // Drag a token anywhere on the pitch; a press without movement selects the slot instead.
  const onDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moved.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    setDrag(i);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag == null || !pitch.current) return;
    if (!moved.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) < 6) return;
    moved.current = true;
    const r = pitch.current.getBoundingClientRect();
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 5, 95), y = clamp(((e.clientY - r.top) / r.height) * 100, 5, 95);
    setState((st) => ({ ...st, slots: st.slots.map((s, j) => (j === drag ? { ...s, x: Math.round(x), y: Math.round(y) } : s)) }));
    setDirty(true);
  };
  const onUp = () => {
    if (drag != null && !moved.current) setSel((s) => (s === drag ? null : drag));
    setDrag(null);
  };

  const assign = (pid: string | null) => {
    const target = sel ?? slots.findIndex((s) => !s.pid);
    if (target < 0) return;
    const next = slots.map((s) => ({ ...s }));
    const from = pid ? placed.get(pid) : undefined;
    if (from != null && from !== target) next[from].pid = next[target].pid;   // swap with the player already there
    next[target].pid = pid;
    set(next);
    const empty = next.findIndex((s, j) => j > target && !s.pid);
    setSel(sel == null ? null : empty >= 0 ? empty : null);
  };

  const role = sel != null ? roleAt(slots[sel].y) : null;
  const list = squad.slice().sort((a, b) => (role ? fit(b, role) - fit(a, role) : 0) || b.ovr - a.ovr);
  const filled = slots.filter((s) => s.pid).length;

  return (
    <div className="fm" onClick={closeModal}>
      <div className="fm-in lb" role="dialog" aria-modal="true" aria-label="Xếp đội hình" onClick={(e) => e.stopPropagation()}>
        <div className="fm-head">
          <div className="fm-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Crest team={team} text={false} />Đội hình {team.short}</div>
          <button type="button" className="fm-x" onClick={closeModal} aria-label="Đóng">×</button>
        </div>
        <div className="lb-top">
          <div className="seg">{(['s7', 's5'] as Format[]).map((f) => <button key={f} type="button" className={format === f ? 'on' : ''} onClick={() => switchFormat(f)}>{FORMAT_LABEL[f]}{saved(f) ? ' ✓' : ''}</button>)}</div>
          <div className="lb-tpl">
            <span className="k10">MẪU ĐỘI HÌNH</span>
            {FORMATIONS[format].map((f) => <button key={f} type="button" className={'opt' + (formation === f ? ' on' : '')} onClick={() => pickTemplate(f)}>{f}</button>)}
          </div>
        </div>
        <div className="lb-body">
          <div className="lb-pitch-col">
            <Pitch className="lb-pitch" innerRef={pitch} half>
              <div className="lb-layer" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
                {slots.map((s, i) => (
                  <Token key={i} p={s.pid ? byId.get(s.pid) : null} team={team} x={s.x} y={s.y} delay={i * 0.03}
                    selected={sel === i} dragging={drag === i && moved.current} onPointerDown={onDown(i)} />
                ))}
              </div>
            </Pitch>
            <div className="note" style={{ textAlign: 'center' }}>Kéo cầu thủ để đổi vị trí tự do · bấm vào vị trí để chọn người · bấm mẫu đội hình để xếp lại gọn.</div>
          </div>
          <div className="lb-side">
            <div className="lb-side-h">
              <b>{sel != null ? `Vị trí ${sel + 1} · ${GNAME[role!]}` : 'Chọn cầu thủ'}</b>
              <span>{filled}/{SIZE[format]} vị trí</span>
            </div>
            {sel != null && slots[sel].pid && <button type="button" className="btn-cancel" onClick={() => assign(null)}>Để trống vị trí này</button>}
            {sel == null && <div className="note">Bấm một vị trí trên sân, hoặc bấm cầu thủ để đưa vào vị trí trống đầu tiên.</div>}
            <div className="lb-list">
              {list.map((p) => {
                const at = placed.get(p.id);
                const good = role ? fit(p, role) : 0;
                return (
                  <button type="button" key={p.id} className={'lb-p' + (at != null ? ' on' : '') + (good === 2 ? ' fit' : '')} onClick={() => assign(p.id)}>
                    <span className="lb-ovr" style={{ background: team.color }}>{p.ovr}</span>
                    <span className="lb-n"><b>{p.name}</b><small>{p.positions.join(' / ')}{at != null ? ` · đang ở vị trí ${at + 1}` : ' · dự bị'}</small></span>
                    {good === 2 && <em>Hợp</em>}
                  </button>
                );
              })}
              {!squad.length && <div className="note">Đội chưa có cầu thủ nào.</div>}
            </div>
            <div className="lb-acts">
              <button type="button" className="btn-cancel" onClick={() => { set(autoFill(formation, squad)); setSel(null); }}>Tự xếp theo chỉ số</button>
              <button type="button" className="btn-cancel" onClick={() => { set(slots.map((s) => ({ ...s, pid: null }))); setSel(null); }}>Xóa hết</button>
            </div>
            <button type="button" className="btn-submit" disabled={busy || (!dirty && !!saved(format))}
              onClick={() => act('save', () => api.saveLineup(teamId, format, formation, slots).then(() => setDirty(false)), `Đã lưu đội hình ${FORMAT_LABEL[format]} · ${formation}`)}>
              {pending ? <><Spin /> Đang lưu…</> : dirty || !saved(format) ? `Lưu đội hình ${FORMAT_LABEL[format]}` : 'Đã lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
