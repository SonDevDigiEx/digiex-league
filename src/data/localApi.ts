// Browser-only demo backend (used when Supabase env vars are not set).
// Mirrors the server-side permission rules so the demo behaves like production.
import { blobToDataUrl, clamp, todayStr, valOf } from '../lib/league';
import type { MyVote, Profile, Snapshot } from '../lib/types';
import type { Api } from './api';
import { SEED_USERS, seedData, type SeedData, type SeedUser } from './seed';

const KEY = 'digiex-league-v3';
const SESSION = 'digiex-session';
const PW = '123456';

interface Store extends SeedData {
  v: 3;
  users: (SeedUser & { pw: string })[];
  /** username -> matchId -> vote */
  my: Record<string, Record<string, MyVote>>;
}

const fresh = (): Store => ({ v: 3, ...seedData(), users: SEED_USERS.map((u) => ({ ...u, pw: PW })), my: {} });

function read(): Store {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && d.v === 3) return d;
  } catch { /* ignore */ }
  return fresh();
}

const toProfile = (u: SeedUser): Profile => ({ id: u.u, username: u.u, name: u.name, role: u.role, team: u.team ?? null });
const fail = (msg: string): never => { throw new Error(msg); };

export function createLocalApi(): Api {
  const listeners = new Set<() => void>();
  const write = (d: Store) => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { fail('Bộ nhớ trình duyệt đã đầy. Hãy dùng ảnh nhỏ hơn.'); }
    listeners.forEach((f) => f());
  };
  const sessionUser = (d: Store) => {
    let u: string | null = null;
    try { u = localStorage.getItem(SESSION); } catch { /* ignore */ }
    return d.users.find((x) => x.u === u) || null;
  };
  /** Run a mutation as the signed-in user. */
  const mutate = async <T>(fn: (d: Store, me: Store['users'][number] | null) => T): Promise<T> => {
    const d = read();
    const out = fn(d, sessionUser(d));
    write(d);
    return out;
  };
  const need = (me: SeedUser | null) => me || fail('Bạn cần đăng nhập.');
  const canTeam = (me: SeedUser | null, tid: string) => !!me && (me.role === 'admin' || ((me.role === 'chair' || me.role === 'coach') && me.team === tid));
  const isChairOf = (me: SeedUser | null, tid: string) => !!me && me.role === 'chair' && me.team === tid;
  const isAdmin = (me: SeedUser | null) => !!me && me.role === 'admin';

  window.addEventListener('storage', (e) => { if (e.key === KEY) listeners.forEach((f) => f()); });

  return {
    mode: 'local',
    async load(): Promise<Snapshot> {
      const d = read();
      const me = sessionUser(d);
      return {
        teams: d.teams, players: d.players, matches: d.matches, transfers: d.transfers,
        offers: d.offers.map((o) => ({ ...o, byName: d.users.find((u) => u.u === o.by)?.name || o.by })),
        my: me ? d.my[me.u] || {} : {},
      };
    },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    async currentUser() { const u = sessionUser(read()); return u ? toProfile(u) : null; },
    async signIn(username, password) {
      const d = read();
      const acc = d.users.find((x) => x.u === username.trim().toLowerCase() && x.pw === password);
      if (!acc) fail('Sai tên đăng nhập hoặc mật khẩu.');
      try { localStorage.setItem(SESSION, acc!.u); } catch { /* ignore */ }
      return toProfile(acc!);
    },
    async signOut() { try { localStorage.removeItem(SESSION); } catch { /* ignore */ } },
    demoAccounts() {
      const d = read();
      return d.users.map((u) => ({ u: u.u, pw: u.pw, label: u.role === 'admin' ? 'Ban tổ chức' : u.role === 'chair' ? 'Chủ tịch' : u.role === 'coach' ? 'Ban huấn luyện' : 'Thành viên' }))
        .map((a, i) => ({ ...a, label: a.label + (d.users[i].team ? ' ' + (d.teams.find((t) => t.id === d.users[i].team)?.short || '') : '') }));
    },

    createTeam: (f) => mutate((d, me) => {
      if (!isAdmin(me)) fail('Chỉ Ban tổ chức được thêm đội.');
      const id = 't' + Date.now();
      const short = f.short.trim().toUpperCase().slice(0, 4);
      d.teams.push({ id, name: f.name.trim(), short, color: f.color, color2: f.color2, motto: f.motto || 'Chiến đến cùng', founded: new Date().getFullYear(), coach: { name: 'Chưa bổ nhiệm' }, chair: { name: f.chair || 'Chưa bổ nhiệm', since: String(new Date().getFullYear()), quote: 'Hành trình mới bắt đầu.' }, logo: null });
      const cu = short.toLowerCase() + '.chair';
      if (!d.users.find((x) => x.u === cu)) d.users.push({ u: cu, pw: PW, name: f.chair || 'Chủ tịch ' + short, role: 'chair', team: id });
      return { id, note: 'TK chủ tịch: ' + cu };
    }),
    async setTeamLogo(teamId, image) {
      const url = image ? await blobToDataUrl(image) : null;
      await mutate((d, me) => {
        if (!canTeam(me, teamId)) fail('Bạn không có quyền với đội này.');
        d.teams.find((t) => t.id === teamId)!.logo = url;
      });
    },
    uploadPlayerPhoto: (_teamId, image) => blobToDataUrl(image),
    savePlayer: (f) => mutate((d, me) => {
      const ovr = clamp(Math.round(f.ovr) || 70, 40, 99);
      const stats = f.stats.map((v) => clamp(Math.round(v), 20, 99));
      if (f.id) {
        const p = d.players.find((x) => x.id === f.id) || fail('Không tìm thấy cầu thủ.');
        if (!canTeam(me, p.teamId)) fail('Bạn không có quyền với đội này.');
        Object.assign(p, { name: f.name.trim(), pos: f.pos, num: f.num, age: f.age, foot: f.foot, ovr, stats, value: valOf(ovr), photo: f.photo });
      } else {
        if (!canTeam(me, f.teamId)) fail('Bạn không có quyền với đội này.');
        d.players.push({ id: 'p' + Date.now(), teamId: f.teamId, name: f.name.trim(), pos: f.pos, num: f.num, age: f.age, foot: f.foot, ovr, stats, value: valOf(ovr), photo: f.photo });
      }
    }),
    deletePlayer: (id) => mutate((d, me) => {
      const p = d.players.find((x) => x.id === id);
      if (!p) return;
      if (!canTeam(me, p.teamId)) fail('Bạn không có quyền với đội này.');
      d.players = d.players.filter((x) => x.id !== id);
      d.offers = d.offers.filter((o) => o.pid !== id);
    }),

    scheduleMatch: (f) => mutate((d, me) => {
      if (!isAdmin(me)) fail('Chỉ Ban tổ chức được lên lịch.');
      d.matches.push({ id: 'm' + Date.now(), date: new Date(f.date).toISOString(), home: f.home, away: f.away, hs: 0, as: 0, status: 'up', venue: f.venue, votes: { home: 0, draw: 0, away: 0 }, sv: {}, scorers: [] });
    }),
    finishMatch: (id, hs, as) => mutate((d, me) => {
      if (!isAdmin(me)) fail('Chỉ Ban tổ chức được nhập kết quả.');
      const m = d.matches.find((x) => x.id === id) || fail('Không tìm thấy trận.');
      Object.assign(m, { hs, as, status: 'done' });
    }),
    voteWinner: (matchId, key) => mutate((d, me) => {
      const u = need(me);
      const m = d.matches.find((x) => x.id === matchId) || fail('Không tìm thấy trận.');
      if (m.status === 'done') fail('Trận đã kết thúc.');
      const my = (d.my[u.u] ||= {});
      if (my[matchId]?.winner) fail('Bạn đã vote trận này.');
      m.votes[key]++;
      my[matchId] = { ...my[matchId], winner: key };
    }),
    voteScore: (matchId, score) => mutate((d, me) => {
      const u = need(me);
      const m = d.matches.find((x) => x.id === matchId) || fail('Không tìm thấy trận.');
      if (m.status === 'done') fail('Trận đã kết thúc.');
      const my = (d.my[u.u] ||= {});
      if (my[matchId]?.score) fail('Bạn đã dự đoán trận này.');
      m.sv[score] = (m.sv[score] || 0) + 1;
      my[matchId] = { ...my[matchId], score };
    }),

    transferPlayer: (pid, to, fee) => mutate((d, me) => {
      const p = d.players.find((x) => x.id === pid) || fail('Không tìm thấy cầu thủ.');
      if (!(isAdmin(me) || isChairOf(me, p.teamId))) fail('Chỉ Chủ tịch đội hoặc Ban tổ chức được chuyển nhượng.');
      if (to === p.teamId) fail('Chọn đội nhận.');
      d.transfers.push({ pid: p.id, name: p.name, from: p.teamId, to, fee, date: todayStr() });
      p.teamId = to;
    }),
    makeOffer: (pid, price, note) => mutate((d, me) => {
      const p = d.players.find((x) => x.id === pid) || fail('Không tìm thấy cầu thủ.');
      if (!me || me.role !== 'chair' || !me.team) fail('Chỉ Chủ tịch đội được gửi đề nghị.');
      if (p.teamId === me!.team) fail('Cầu thủ đã thuộc đội của bạn.');
      if (d.offers.some((o) => o.pid === pid && o.from === me!.team && o.status === 'pending')) fail('Bạn đã gửi đề nghị cho cầu thủ này.');
      d.offers.push({ id: 'o' + Date.now(), pid, from: me!.team!, to: p.teamId, price, value: p.value, note: note.trim(), by: me!.u, status: 'pending', date: todayStr() });
    }),
    respondOffer: (id, accept) => mutate((d, me) => {
      const o = d.offers.find((x) => x.id === id);
      if (!o || o.status !== 'pending') fail('Yêu cầu không còn hiệu lực.');
      if (!isChairOf(me, o!.to)) fail('Chỉ Chủ tịch đội bán được duyệt.');
      if (!accept) { o!.status = 'rejected'; return 'Đã từ chối đề nghị'; }
      const p = d.players.find((x) => x.id === o!.pid);
      if (!p || p.teamId !== o!.to) { o!.status = 'cancelled'; return 'Cầu thủ không còn thuộc đội của bạn'; }
      p.teamId = o!.from; o!.status = 'accepted';
      d.transfers.push({ pid: p.id, name: p.name, from: o!.to, to: o!.from, fee: o!.price, date: todayStr() });
      d.offers.forEach((x) => { if (x !== o && x.pid === o!.pid && x.status === 'pending') x.status = 'rejected'; });
      return 'Chuyển nhượng hoàn tất: ' + p.name + ' → ' + (d.teams.find((t) => t.id === o!.from)?.short || '');
    }),
    cancelOffer: (id) => mutate((d, me) => {
      const o = d.offers.find((x) => x.id === id);
      if (!o || o.status !== 'pending') fail('Yêu cầu không còn hiệu lực.');
      if (!isChairOf(me, o!.from)) fail('Chỉ đội gửi được hủy.');
      o!.status = 'cancelled';
    }),
    async reset() { write(fresh()); },
  };
}
