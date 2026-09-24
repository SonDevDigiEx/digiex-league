import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Foot, Goal, Match, MyVote, Offer, OfferStatus, Player, Pos, Profile, Role, Snapshot, Team, Transfer, WinnerKey } from '../lib/types';
import type { Api } from './api';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const toTeam = (r: Row): Team => ({
  id: r.id, name: r.name, short: r.short, color: r.color, color2: r.color2, motto: r.motto, founded: r.founded,
  chair: { name: r.chair_name, since: r.chair_since, quote: r.chair_quote }, coach: { name: r.coach_name }, logo: r.logo_url,
});
const toPlayer = (r: Row): Player => ({
  id: r.id, teamId: r.team_id, name: r.name, pos: r.pos as Pos, ovr: r.ovr, num: r.num, age: r.age, foot: r.foot as Foot,
  stats: r.stats, value: Number(r.value), photo: r.photo_url,
});
const toMatch = (r: Row): Match => ({
  id: r.id, date: r.kickoff, home: r.home_team, away: r.away_team, hs: r.home_score, as: r.away_score, status: r.status,
  venue: r.venue, scorers: (r.scorers || []) as Goal[], votes: { home: 0, draw: 0, away: 0 }, sv: {},
});
const toTransfer = (r: Row): Transfer => ({ pid: r.player_id, name: r.player_name, from: r.from_team, to: r.to_team, fee: Number(r.fee), date: r.created_on });
const toOffer = (r: Row): Offer => ({
  id: r.id, pid: r.player_id, from: r.buyer_team, to: r.seller_team, price: Number(r.price), value: Number(r.value),
  note: r.note, byName: r.creator?.name || '—', status: r.status as OfferStatus, date: r.created_on,
});
const toProfile = (r: Row): Profile => ({ id: r.id, username: r.username, name: r.name, role: r.role as Role, team: r.team_id });

/** Turn Supabase/Postgres errors into messages for the toast/form. RPCs raise Vietnamese messages already. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) {
    const { code, message } = res.error;
    if (code === '42501' || /row-level security|permission denied/i.test(message)) throw new Error('Bạn không có quyền thực hiện thao tác này.');
    throw new Error(message);
  }
  return res.data as NonNullable<T>;
}

export function createSupabaseApi(url: string, key: string, emailDomain: string): Api {
  const sb: SupabaseClient = createClient(url, key);

  const uid = async () => (await sb.auth.getSession()).data.session?.user.id ?? null;
  const upload = async (path: string, image: Blob) => {
    check(await sb.storage.from('media').upload(path, image, { contentType: image.type, upsert: false }));
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  return {
    mode: 'supabase',
    async load(): Promise<Snapshot> {
      const me = await uid();
      const [teams, players, matches] = await Promise.all([
        sb.from('teams').select('*').order('created_at').then(check),
        sb.from('players').select('*').then(check),
        sb.from('matches').select('*').then(check),
      ]);
      const snap: Snapshot = { teams: teams.map(toTeam), players: players.map(toPlayer), matches: matches.map(toMatch), transfers: [], offers: [], my: {} };
      if (!me) return snap;
      const [transfers, offers, stats, votes] = await Promise.all([
        sb.from('transfers').select('*').order('id').then(check),
        sb.from('offers').select('*, creator:profiles(name)').then(check),
        sb.rpc('vote_stats').then(check),
        sb.from('votes').select('match_id, winner, score').eq('user_id', me).then(check),
      ]);
      snap.transfers = transfers.map(toTransfer);
      snap.offers = offers.map(toOffer);
      const byId = new Map(snap.matches.map((m) => [m.id, m]));
      (stats as Row[]).forEach((s) => {
        const m = byId.get(s.match_id);
        if (!m) return;
        if (s.kind === 'winner') m.votes[s.key as WinnerKey] = Number(s.n);
        else m.sv[s.key] = Number(s.n);
      });
      (votes as Row[]).forEach((v) => {
        const mv: MyVote = {};
        if (v.winner) mv.winner = v.winner;
        if (v.score) mv.score = v.score;
        snap.my[v.match_id] = mv;
      });
      return snap;
    },
    subscribe(onChange) {
      let t: ReturnType<typeof setTimeout> | undefined;
      const bump = () => { clearTimeout(t); t = setTimeout(onChange, 250); };
      const ch = sb.channel('league').on('postgres_changes', { event: '*', schema: 'public' }, bump).subscribe();
      const { data: auth } = sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' || ev === 'SIGNED_IN') bump(); });
      const onFocus = () => bump();
      window.addEventListener('focus', onFocus);
      return () => { clearTimeout(t); sb.removeChannel(ch); auth.subscription.unsubscribe(); window.removeEventListener('focus', onFocus); };
    },

    async currentUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      const { data: p } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
      return p ? toProfile(p) : { id: u.id, username: u.email || '', name: u.email || 'Thành viên', role: 'member', team: null };
    },
    async signIn(username, password) {
      const login = username.trim().toLowerCase();
      const email = login.includes('@') ? login : `${login}@${emailDomain}`;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Sai tên đăng nhập hoặc mật khẩu.');
      return (await this.currentUser())!;
    },
    async signOut() { await sb.auth.signOut(); },
    demoAccounts() { return []; },

    async createTeam(f) {
      const row = check(await sb.from('teams').insert({
        name: f.name.trim(), short: f.short.trim().toUpperCase().slice(0, 4), chair_name: f.chair || 'Chưa bổ nhiệm',
        motto: f.motto || 'Chiến đến cùng', color: f.color, color2: f.color2,
      }).select('id').single());
      return { id: row.id, note: 'Gán tài khoản Chủ tịch cho đội trong bảng profiles' };
    },
    async setTeamLogo(teamId, image) {
      const logo_url = image ? await upload(`logos/${teamId}/${rid()}.png`, image) : null;
      const rows = check(await sb.from('teams').update({ logo_url }).eq('id', teamId).select('id'));
      if (!rows.length) throw new Error('Bạn không có quyền với đội này.');
    },
    uploadPlayerPhoto: (teamId, image) => upload(`players/${teamId}/${rid()}.jpg`, image),
    async savePlayer(f) {
      const row = { team_id: f.teamId, name: f.name.trim(), pos: f.pos, ovr: f.ovr, num: f.num, age: f.age, foot: f.foot, stats: f.stats, photo_url: f.photo };
      if (f.id) {
        const { team_id: _t, ...patch } = row;
        const rows = check(await sb.from('players').update(patch).eq('id', f.id).select('id'));
        if (!rows.length) throw new Error('Bạn không có quyền với đội này.');
      } else check(await sb.from('players').insert(row));
    },
    async deletePlayer(id) {
      const rows = check(await sb.from('players').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('Bạn không có quyền với đội này.');
    },

    async scheduleMatch(f) {
      check(await sb.from('matches').insert({ kickoff: new Date(f.date).toISOString(), home_team: f.home, away_team: f.away, venue: f.venue }));
    },
    async finishMatch(id, hs, as) {
      const rows = check(await sb.from('matches').update({ home_score: hs, away_score: as, status: 'done' }).eq('id', id).select('id'));
      if (!rows.length) throw new Error('Chỉ Ban tổ chức được nhập kết quả.');
    },
    async voteWinner(matchId, key) { check(await sb.rpc('vote_winner', { p_match: matchId, p_winner: key })); },
    async voteScore(matchId, score) { check(await sb.rpc('vote_score', { p_match: matchId, p_score: score })); },

    async transferPlayer(pid, to, fee) { check(await sb.rpc('transfer_player', { p_player: pid, p_to: to, p_fee: fee })); },
    async makeOffer(pid, price, note) { check(await sb.rpc('make_offer', { p_player: pid, p_price: price, p_note: note })); },
    async respondOffer(id, accept) { return check(await sb.rpc('respond_offer', { p_offer: id, p_accept: accept })) as string; },
    async cancelOffer(id) { check(await sb.rpc('cancel_offer', { p_offer: id })); },
  };
}
