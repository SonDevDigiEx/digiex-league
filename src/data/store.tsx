import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Match, Player, Profile, Snapshot, Team } from '../lib/types';
import type { Api } from './api';
import { FREE_AGENT } from '../lib/league';
import { createSupabaseApi } from './supabaseApi';

const env = import.meta.env;
const sbUrl = env.VITE_SUPABASE_URL;
const sbKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
/** Set when the build is missing its Supabase env vars; the app shows a setup screen instead of failing requests. */
export const CONFIG_ERROR = sbUrl && sbKey ? null : 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY at build time.';
// Technical detail goes to the console for whoever deploys; users only see a friendly screen.
if (CONFIG_ERROR) console.error('[DigiEx League]', CONFIG_ERROR);
export const api: Api = createSupabaseApi(sbUrl || 'https://not-configured.invalid', sbKey || 'missing');

// ───────── routing (hash based so links to a team / match can be shared) ─────────

export type Route =
  | { view: 'home' } | { view: 'teams'; teamId?: string } | { view: 'matches' } | { view: 'match'; matchId: string }
  | { view: 'market' } | { view: 'manage'; teamId?: string };

function parseHash(): Route {
  const [a, b] = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (a) {
    case 'teams': return { view: 'teams', teamId: b };
    case 'matches': return { view: 'matches' };
    case 'match': return b ? { view: 'match', matchId: b } : { view: 'matches' };
    case 'market': return { view: 'market' };
    case 'manage': return { view: 'manage', teamId: b };
    default: return { view: 'home' };
  }
}
export function hrefOf(r: Route) {
  switch (r.view) {
    case 'home': return '#/';
    case 'teams': return r.teamId ? `#/teams/${r.teamId}` : '#/teams';
    case 'match': return `#/match/${r.matchId}`;
    case 'manage': return r.teamId ? `#/manage/${r.teamId}` : '#/manage';
    default: return `#/${r.view}`;
  }
}

// ───────── modals ─────────

export type Modal =
  | { kind: 'login'; reason?: string }
  | { kind: 'addTeam' }
  | { kind: 'editTeam'; teamId: string }
  | { kind: 'player'; playerId?: string; teamId: string | null }
  | { kind: 'approve'; userId: string }
  | { kind: 'me' }
  | { kind: 'inbox' }
  | { kind: 'transfer'; playerId: string }
  | { kind: 'offer'; playerId: string }
  | { kind: 'schedule' };

export interface Toast { msg: string; err?: boolean; key: number }

interface Ctx {
  snap: Snapshot | null;
  loadError: string | null;
  /** Signed-in account (including one still waiting for approval, which is view-only). */
  user: Profile | null;
  /** Same as user; kept for readability where the pending state matters. */
  me: Profile | null;
  route: Route;
  go(r: Route): void;
  cardId: string | null;
  openCard(id: string): void;
  closeCard(): void;
  modal: Modal | null;
  openModal(m: Modal): void;
  closeModal(): void;
  toast: Toast | null;
  flash(msg: string, err?: boolean): void;
  /** Run a mutation, refresh data and toast the result. Returns false (and toasts) on error unless `rethrow`. */
  run(fn: () => Promise<unknown>, ok?: string | ((r: unknown) => string), rethrow?: boolean): Promise<boolean>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
}

const LeagueCtx = createContext<Ctx | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const user = me;
  const [route, setRoute] = useState<Route>(parseHash);
  const [cardId, setCardId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>();

  const reload = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([api.load(), api.currentUser()]);
      setSnap(s); setMe(u); setLoadError(null);
    } catch (e) {
      console.error('[DigiEx League] load failed', e);
      setLoadError('Không tải được dữ liệu. Kiểm tra kết nối mạng và thử lại.');
    }
  }, []);

  useEffect(() => {
    if (CONFIG_ERROR) return;
    reload().then(() => {
      const e = api.takeAuthError();
      if (e) setModal({ kind: 'login', reason: e });
    });
    return api.subscribe(reload);
  }, [reload]);
  useEffect(() => {
    const on = () => { setRoute(parseHash()); setCardId(null); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const flash = useCallback((msg: string, err?: boolean) => {
    setToast({ msg, err, key: Date.now() });
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const go = useCallback((r: Route) => {
    const h = hrefOf(r);
    if (window.location.hash !== h) window.location.hash = h;
    setRoute(r); setCardId(null);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* ignore */ }
  }, []);

  const run = useCallback<Ctx['run']>(async (fn, ok, rethrow) => {
    try {
      const r = await fn();
      await reload();
      if (ok) flash(typeof ok === 'function' ? ok(r) : ok);
      return true;
    } catch (e) {
      if (rethrow) throw e;
      flash((e as Error).message || 'Có lỗi xảy ra.', true);
      return false;
    }
  }, [reload, flash]);

  const value = useMemo<Ctx>(() => ({
    snap, loadError, user, me, route, go, cardId, modal, toast, flash, run, reload,
    openCard: (id) => { if (!user) setModal({ kind: 'login', reason: 'Đăng nhập để xem chi tiết chỉ số cầu thủ.' }); else setCardId(id); },
    closeCard: () => setCardId(null),
    openModal: setModal,
    closeModal: () => setModal(null),
    signIn: () => api.signInWithGoogle(),
    async signOut() {
      await api.signOut();
      setMe(null); setCardId(null);
      if (route.view === 'manage') go({ view: 'home' });
      await reload();
      flash('Đã đăng xuất');
    },
  }), [snap, loadError, user, me, route, go, cardId, modal, toast, flash, run, reload]);

  return <LeagueCtx.Provider value={value}>{children}</LeagueCtx.Provider>;
}

export function useLeague() {
  const c = useContext(LeagueCtx);
  if (!c) throw new Error('useLeague outside LeagueProvider');
  return c;
}

/** Permission helpers + lookups over the loaded snapshot. Only used to show/hide UI; the server re-checks. */
export function useAccess() {
  const { user, snap } = useLeague();
  return useMemo(() => {
    const u = user;
    const isAdmin = !!u && u.role === 'admin';
    const teams = snap?.teams || [];
    const members = snap?.members || [];
    const players = snap?.players || [];
    return {
      u, isAdmin,
      /** Pending accounts are view-only. */
      canVote: !!u && u.role !== 'pending',
      /** Edit squad/team. Free agents (tid null) are managed by admins only. */
      canTeam: (tid: string | null) => !!u && (isAdmin || (!!tid && (u.role === 'chair' || u.role === 'coach') && u.team === tid)),
      /** Direct moves without consent are an admin tool. */
      canTransfer: (_tid: string | null) => isAdmin,
      /** Release a player to free agency: admin or that team's chairman. */
      canRelease: (tid: string | null) => !!u && !!tid && (isAdmin || (u.role === 'chair' && u.team === tid)),
      /** Team whose staff (chair or coach) the user is — they can send offers / invitations for it. */
      staffT: u && (u.role === 'chair' || u.role === 'coach') ? u.team : null,
      /** Chairmen and coaches are not transferable. */
      isStaffPlayer: (p: Player) => !!p.userId && members.some((m) => m.id === p.userId && (m.role === 'chair' || m.role === 'coach')),
      /** Staff role label for a player whose account is a chair/coach, e.g. "Chủ tịch F8" (null otherwise). */
      staffLabel: (p: Player) => {
        const m = p.userId ? members.find((x) => x.id === p.userId) : undefined;
        if (!m || (m.role !== 'chair' && m.role !== 'coach')) return null;
        const t = teams.find((x) => x.id === m.team);
        return (m.role === 'chair' ? 'Chủ tịch' : 'BHL') + (t ? ' ' + t.short : '');
      },
      /** The signed-in user's own player profile, if any. */
      myPlayer: u ? players.find((p) => p.userId === u.id) ?? null : null,
      canAny: !!u && (isAdmin || u.role === 'chair' || u.role === 'coach'),
      myT: u && u.role === 'chair' ? u.team : null,
      tm: (id: string | null): Team => (id && teams.find((t) => t.id === id)) || FREE_AGENT,
    };
  }, [user, snap]);
}

export const squadOf = (players: Player[], tid: string) => players.filter((p) => p.teamId === tid);
export const findMatch = (ms: Match[], id: string) => ms.find((m) => m.id === id);

/** Re-render every second (countdowns). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
