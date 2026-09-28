// Pan / zoom / crop a photo into the player-card photo frame before uploading.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clamp, encodeCanvas } from '../lib/league';

/** Card photo frame (see .pc-photo: 98 × 106). */
export const CARD_PHOTO_ASPECT = 98 / 106;
/** Team crest (shield) frame. */
export const CREST_ASPECT = 64 / 72;
const FRAME_H = 300;
const MAX_ZOOM = 5;

interface View { z: number; x: number; y: number }

export function ImageCropper({ file, aspect = CARD_PHOTO_ASPECT, outH = 520, shield, title = 'Căn chỉnh ảnh', onDone, onCancel }: {
  file: File; aspect?: number; outH?: number; /** Show the team-crest shield outline. */ shield?: boolean; title?: string;
  onDone: (blob: Blob) => void; onCancel: () => void;
}) {
  const OUT_H = outH;
  const fw = Math.round(FRAME_H * aspect), fh = FRAME_H;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // z = scale relative to "cover"; x / y = image centre offset from the frame centre (px, frame space).
  const [v, setV] = useState<View>({ z: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => {
    let live = true;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { if (live) { setErr(''); setImg(im); } };
    im.onerror = () => { if (live) setErr('Không đọc được ảnh. Hãy chọn file JPG, PNG hoặc WebP.'); };
    im.src = url;
    return () => { live = false; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const cover = img ? Math.max(fw / img.width, fh / img.height) : 1;
  // Allow zooming out until the whole picture fits (useful for cut-out photos).
  const minZ = img ? Math.min(1, Math.min(fw / img.width, fh / img.height) / cover) : 1;
  const fit = (n: View): View => {
    if (!img) return n;
    const z = clamp(n.z, minZ, MAX_ZOOM);
    const w = img.width * cover * z, h = img.height * cover * z;
    // Keep the frame covered when the image is larger than it; otherwise keep the image inside.
    const mx = Math.abs(w - fw) / 2, my = Math.abs(h - fh) / 2;
    return { z, x: clamp(n.x, -mx, mx), y: clamp(n.y, -my, my) };
  };
  const zoomTo = (z: number) => setV((c) => fit({ ...c, z }));

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: v.z };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size >= 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(pinch.current.z * (d / pinch.current.d));
    } else {
      setV((c) => fit({ ...c, x: c.x + e.clientX - prev.x, y: c.y + e.clientY - prev.y }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
  };
  const onWheel = (e: React.WheelEvent) => zoomTo(v.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08));

  const save = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const k = OUT_H / fh;
      const c = document.createElement('canvas');
      c.width = Math.round(fw * k); c.height = OUT_H;
      const s = cover * v.z * k;
      const w = img.width * s, h = img.height * s;
      c.getContext('2d')!.drawImage(img, c.width / 2 + v.x * k - w / 2, c.height / 2 + v.y * k - h / 2, w, h);
      onDone(await encodeCanvas(c, 'photo'));
    } catch {
      setErr('Không cắt được ảnh, thử lại với ảnh khác.');
      setBusy(false);
    }
  };

  const w = img ? img.width * cover * v.z : 0, h = img ? img.height * cover * v.z : 0;
  // Portal: ancestors with transforms/animations would otherwise trap the fixed overlay.
  return createPortal(
    <div className="crop" onClick={(e) => { e.stopPropagation(); onCancel(); }} role="dialog" aria-modal="true" aria-label="Căn chỉnh ảnh">
      <div className="crop-in" onClick={(e) => e.stopPropagation()}>
        <div className="crop-title">{title}</div>
        <div className="crop-hint">Kéo để di chuyển · cuộn chuột hoặc chụm 2 ngón để phóng to</div>
        <div className="crop-stage" style={{ width: fw, height: fh }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
          {img && <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, left: fw / 2 + v.x - w / 2, top: fh / 2 + v.y - h / 2 }} />}
          {shield
            ? <svg className="crop-shield" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path fillRule="evenodd" d="M0 0H100V100H0Z M50 0 100 12 100 62 50 100 0 62 0 12Z" /><path className="edge" d="M50 0 100 12 100 62 50 100 0 62 0 12Z" /></svg>
            : <div className="crop-grid" />}
          {!img && !err && <div className="crop-load">Đang tải ảnh…</div>}
        </div>
        <div className="crop-zoom">
          <button type="button" aria-label="Thu nhỏ" onClick={() => zoomTo(v.z / 1.2)}>−</button>
          <input type="range" min={minZ} max={MAX_ZOOM} step="any" value={v.z} aria-label="Mức phóng to" onChange={(e) => zoomTo(+e.target.value)} />
          <button type="button" aria-label="Phóng to" onClick={() => zoomTo(v.z * 1.2)}>+</button>
          <button type="button" className="crop-reset" onClick={() => setV({ z: 1, x: 0, y: 0 })}>Đặt lại</button>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="crop-acts">
          <button type="button" className="ph-btn grey" onClick={onCancel} disabled={busy}>Hủy</button>
          <button type="button" className="ph-btn" style={{ background: '#c6ff3d', color: '#06080d' }} onClick={save} disabled={!img || busy}>{busy ? 'Đang xử lý…' : 'Dùng ảnh này'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
