import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Foot, Goal, Match, MyVote, Offer, OfferStatus, Participation, Player, Pos, Profile, Role, Snapshot, StatsStatus, Team, Transfer, ValueFactors, WinnerKey } from '../lib/types';
import type { Api } from './api';
import { extOf } from '../lib/league';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const toTeam = (r: Row): Team => ({
  id: r.id, name: r.name, short: r.short, color: r.color, color2: r.color2, motto: r.motto, founded: r.founded,
  chair: { name: r.chair_name, since: r.chair_since, quote: r.chair_quote }, coach: { name: r.coach_name }, logo: r.logo_url, cover: r.cover_url ?? null,
});
const toPlayer = (r: Row): Player => ({
  id: r.id, teamId: r.team_id, name: r.name, pos: r.pos as Pos, positions: ((r.positions?.length ? r.positions : [r.pos]) as Pos[]), ovr: r.ovr, num: r.num, age: r.age, foot: r.foot as Foot,
  stats: r.stats, value: Number(r.value), photo: r.photo_url, userId: r.user_id ?? null,
});
const toMatch = (r: Row): Match => ({
  id: r.id, date: r.kickoff, home: r.home_team, away: r.away_team, hs: r.home_score, as: r.away_score, status: r.status,
  venue: r.venue, scorers: (r.scorers || []) as Goal[], mom: r.mom_player ?? null, votes: { home: 0, draw: 0, away: 0 }, sv: {},
  cancelReason: r.cancel_reason ?? null, seriesId: r.series_id ?? null, tournamentId: r.tournament_id ?? null, stage: r.stage ?? null,
});
const toTransfer = (r: Row): Transfer => ({ pid: r.player_id, name: r.player_name, from: r.from_team, to: r.to_team, fee: Number(r.fee), date: r.created_on });
const toOffer = (r: Row): Offer => ({
  id: r.id, pid: r.player_id, from: r.buyer_team, to: r.seller_team, price: Number(r.price), value: Number(r.value),
  note: r.note, byName: r.creator?.name || '—', status: r.status as OfferStatus, date: r.created_on,
});
const num = (v: unknown) => (v == null ? null : Number(v));
const toParticipation = (r: Row): Participation => ({
  matchId: r.match_id, playerId: r.player_id, teamId: r.team_id, goals: num(r.goals), assists: num(r.assists), saves: num(r.saves),
  yellow: num(r.yellow), red: num(r.red), rating: num(r.rating), note: r.note, status: r.stats_status as StatsStatus,
});
const toProfile = (r: Row): Profile => ({
  id: r.id, username: r.username, name: r.name, role: r.role as Role, team: r.team_id, email: r.email || '', avatar: r.avatar_url || null, nameChangedAt: r.name_changed_at ?? null,
});

/** Turn Supabase/Postgres errors into messages for the toast/form. RPCs raise Vietnamese messages already. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (res.error) {
    const { code, message } = res.error;
    if (code === '42501' || /row-level security|permission denied/i.test(message)) throw new Error('Bạn không có quyền thực hiện thao tác này.');
    if (/Failed to fetch|NetworkError/i.test(message)) throw new Error('Mất kết nối máy chủ. Kiểm tra mạng và thử lại.');
    // P0001 = our own RAISE EXCEPTION messages (already user-facing Vietnamese). Anything else stays in the console.
    if (code === 'P0001') throw new Error(message);
    console.error('[DigiEx League]', res.error);
    throw new Error('Có lỗi xảy ra, vui lòng thử lại.');
  }
  return res.data as NonNullable<T>;
}

const RETURN_HASH = 'digiex-return-hash';

/** Read (and strip) OAuth error parameters that Supabase appends on a failed redirect. */
function readAuthError(): string | null {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
  const raw = q.get('error_description') || h.get('error_description');
  if (!raw) return null;
  window.history.replaceState(null, '', window.location.pathname + '#/');
  console.error('[DigiEx League] OAuth error', raw);
  return 'Đăng nhập không thành công, vui lòng thử lại.';
}

export function createSupabaseApi(url: string, key: string): Api {
  let authError = readAuthError();
  const sb: SupabaseClient = createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });

  // After the PKCE exchange, drop ?code=… from the address bar and go back to the page the user signed in from.
  const ready = sb.auth.getSession().then(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has('code')) {
      let back = '#/';
      try { back = sessionStorage.getItem(RETURN_HASH) || '#/'; sessionStorage.removeItem(RETURN_HASH); } catch { /* ignore */ }
      window.history.replaceState(null, '', window.location.pathname + back);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  });

  const uid = async () => { await ready; return (await sb.auth.getSession()).data.session?.user.id ?? null; };
  const upload = async (path: string, image: Blob) => {
    check(await sb.storage.from('media').upload(path, image, { contentType: image.type, upsert: false }));
    return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
  };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  return {
    async load(): Promise<Snapshot> {
      const me = await uid();
      // Create next week's match for fixed fixtures whose latest match is over (idempotent on the server).
      await Promise.all(['roll_series', 'daily_value_refresh'].map((fn) =>
        sb.rpc(fn).then(({ error }) => { if (error) console.warn('[DigiEx League]', fn, error.message); })));
      const since = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
      const [teams, players, matches, participants, series, history, tours, tteams, awards, lineups] = await Promise.all([
        sb.from('teams').select('*').order('created_at').then(check),
        sb.from('players').select('*').then(check),
        sb.from('matches').select('*').then(check),
        sb.from('match_players').select('*').order('joined_at').then(check),
        sb.from('match_series').select('*').then(check),
        sb.from('player_value_history').select('player_id, day, value').gte('day', since).order('day').then(check),
        sb.from('tournaments').select('*').order('created_at', { ascending: false }).then(check),
        sb.from('tournament_teams').select('*').order('seed').then(check),
        sb.from('tournament_awards').select('*').order('created_at').then(check),
        sb.from('team_lineups').select('*').then(check),
      ]);
      const valueHistory: Snapshot['valueHistory'] = {};
      (history as Row[]).forEach((h) => { (valueHistory[h.player_id] ||= []).push({ day: h.day, value: Number(h.value) }); });
      const snap: Snapshot = {
        teams: teams.map(toTeam), players: players.map(toPlayer), matches: matches.map(toMatch), transfers: [], offers: [], my: {}, members: [], applications: [],
        lineups: (lineups as Row[]).map((r) => ({ teamId: r.team_id, format: r.format, formation: r.formation, slots: (r.slots || []).map((s: Row) => ({ pid: s.pid ?? null, x: Number(s.x), y: Number(s.y) })) })),
        participants: participants.map(toParticipation),
        series: (series as Row[]).map((r) => ({ id: r.id, home: r.home_team, away: r.away_team, venue: r.venue, active: r.active })),
        valueHistory,
        tournaments: (tours as Row[]).map((r) => ({
          id: r.id, name: r.name, format: r.format, structure: r.structure, groupCount: r.group_count, status: r.status,
          startsOn: r.starts_on, endsOn: r.ends_on, settings: r.settings, rulesMd: r.rules_md, bracket: r.bracket, drawnAt: r.drawn_at,
          teams: (tteams as Row[]).filter((x) => x.tournament_id === r.id).map((x) => ({ teamId: x.team_id, group: x.group_label, seed: x.seed })),
        })),
        awards: (awards as Row[]).map((r) => ({
          id: r.id, tournamentId: r.tournament_id, kind: r.kind, title: r.title, teamId: r.team_id, playerId: r.player_id, playerName: r.player_name, note: r.note,
        })),
      };
      if (!me) return snap;
      const [transfers, offers, stats, votes, members, apps] = await Promise.all([
        sb.from('transfers').select('*').order('id').then(check),
        sb.from('offers').select('*, creator:profiles(name)').then(check),
        sb.rpc('vote_stats').then(check),
        sb.from('votes').select('match_id, winner, score').eq('user_id', me).then(check),
        sb.from('profiles').select('*').order('name').then(check),
        sb.from('team_applications').select('*').order('created_at', { ascending: false }).then(check),
      ]);
      snap.applications = (apps as Row[]).map((r) => ({ id: r.id, playerId: r.player_id, teamId: r.team_id, message: r.message, status: r.status, date: r.created_at }));
      snap.transfers = transfers.map(toTransfer);
      snap.offers = offers.map(toOffer);
      snap.members = members.map(toProfile);
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
      const id = await uid();
      if (!id) return null;
      // Network/server errors propagate (the app shows "retry"); only a missing row means the account has no profile.
      const p = check(await sb.from('profiles').select('*').eq('id', id).limit(1)) as Row[];
      if (p[0]) return toProfile(p[0]);
      // No profile means the account was created before the trigger existed or was refused: treat as signed out.
      await sb.auth.signOut();
      authError = authError || 'Không tìm thấy hồ sơ tài khoản. Vui lòng đăng nhập lại.';
      return null;
    },
    async signInWithGoogle() {
      try { sessionStorage.setItem(RETURN_HASH, window.location.hash || '#/'); } catch { /* ignore */ }
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw new Error('Không mở được đăng nhập Google: ' + error.message);
    },
    async signOut() { await sb.auth.signOut(); },
    async setMyPhoto(image) {
      const me = await uid();
      if (!me) throw new Error('Bạn cần đăng nhập.');
      const url = image ? await upload(`avatars/${me}/${rid()}.${extOf(image)}`, image) : null;
      check(await sb.rpc('set_my_photo', { p_url: url }));
    },
    takeAuthError() { const e = authError; authError = null; return e; },

    async createTeam(f) {
      const row = check(await sb.from('teams').insert({
        name: f.name.trim(), short: f.short.trim().toUpperCase().slice(0, 4), motto: f.motto.trim() || 'Chiến đến cùng', color: f.color, color2: f.color2,
      }).select('id').single());
      return { id: row.id };
    },
    async updateTeam(teamId, f) {
      check(await sb.rpc('update_team', { p_team: teamId, p_name: f.name, p_short: f.short, p_motto: f.motto, p_quote: f.chairQuote ?? '', p_color: f.color, p_color2: f.color2 }));
    },
    async setTeamLogo(teamId, image) {
      const logo_url = image ? await upload(`logos/${teamId}/${rid()}.${extOf(image)}`, image) : null;
      const rows = check(await sb.from('teams').update({ logo_url }).eq('id', teamId).select('id'));
      if (!rows.length) throw new Error('Bạn không có quyền với đội này.');
    },
    async setMember(userId, role, teamId) { check(await sb.rpc('set_member', { p_user: userId, p_role: role, p_team: teamId })); },
    async handoverChair(userId) { check(await sb.rpc('handover_chair', { p_user: userId })); },
    async setMyNumber(num) { check(await sb.rpc('set_my_number', { p_num: num })); },
    async valueFactors(playerId) { return check(await sb.rpc('value_factors', { p_player: playerId })) as ValueFactors; },
    async setMyPositions(positions) { check(await sb.rpc('set_my_positions', { p_positions: positions })); },
    async rejectMember(userId) { check(await sb.rpc('reject_member', { p_user: userId })); },
    async approveMember(userId, role, roleTeam, f) {
      check(await sb.rpc('approve_member', {
        p_user: userId, p_role: role, p_role_team: roleTeam, p_make_player: !!f,
        p_name: f?.name.trim() ?? null, p_pos: f?.pos ?? null, p_ovr: f?.ovr ?? null, p_num: f?.num ?? null, p_age: f?.age ?? null,
        p_foot: f?.foot ?? null, p_stats: f?.stats ?? null, p_photo: f?.photo ?? null, p_team: f?.teamId ?? null,
      }));
      // approve_member stores the primary position; add the secondary ones (admin may edit any player).
      if (f && f.positions.length > 1) check(await sb.from('players').update({ positions: f.positions }).eq('user_id', userId));
    },

    // Free agents' photos live under players/free/ (admin-only folder).
    uploadPlayerPhoto: (teamId, image) => upload(`players/${teamId || 'free'}/${rid()}.${extOf(image)}`, image),
    async savePlayer(f) {
      const row = { team_id: f.teamId, name: f.name.trim(), pos: f.positions[0] ?? f.pos, positions: f.positions.length ? f.positions : [f.pos], ovr: f.ovr, num: f.num, age: f.age, foot: f.foot, stats: f.stats, photo_url: f.photo };
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
      const kickoff = new Date(f.date).toISOString();
      const extra = { tournament_id: f.tournamentId || null, stage: f.stage?.trim() || null };
      if (f.weekly) {
        const sid = check(await sb.rpc('create_series', { p_home: f.home, p_away: f.away, p_first: kickoff, p_venue: f.venue })) as unknown as string;
        if (extra.tournament_id || extra.stage) {
          check(await sb.from('match_series').update({ tournament_id: extra.tournament_id }).eq('id', sid));
          check(await sb.from('matches').update(extra).eq('series_id', sid));
        }
      } else check(await sb.from('matches').insert({ kickoff, home_team: f.home, away_team: f.away, venue: f.venue, ...extra }));
    },
    async setTeamCover(teamId, image) {
      const cover_url = image ? await upload(`covers/${teamId}/${rid()}.jpg`, image) : null;
      const rows = check(await sb.from('teams').update({ cover_url }).eq('id', teamId).select('id'));
      if (!rows.length) throw new Error('Bạn không có quyền với đội này.');
    },
    async createTournament(f) {
      const row = check(await sb.from('tournaments').insert({
        name: f.name.trim(), format: f.format, structure: f.structure, group_count: f.groupCount, starts_on: f.startsOn, ends_on: f.endsOn,
        settings: f.settings, rules_md: f.rulesMd,
      }).select('id').single());
      if (f.teamIds.length) check(await sb.from('tournament_teams').insert(f.teamIds.map((t) => ({ tournament_id: row.id, team_id: t }))));
      if (f.teamIds.length >= 2) check(await sb.rpc('draw_tournament', { p_id: row.id }));
      return row.id as string;
    },
    async updateTournament(id, f) {
      const patch: Row = {};
      if (f.name !== undefined) patch.name = f.name.trim();
      if (f.format) patch.format = f.format;
      if (f.structure) patch.structure = f.structure;
      if (f.groupCount) patch.group_count = f.groupCount;
      if (f.startsOn !== undefined) patch.starts_on = f.startsOn;
      if (f.endsOn !== undefined) patch.ends_on = f.endsOn;
      if (f.settings) patch.settings = f.settings;
      if (f.rulesMd !== undefined) patch.rules_md = f.rulesMd;
      if (f.status) patch.status = f.status;
      if (Object.keys(patch).length) {
        const rows = check(await sb.from('tournaments').update(patch).eq('id', id).select('id'));
        if (!rows.length) throw new Error('Chỉ Ban tổ chức được sửa giải đấu.');
      }
      if (f.teamIds) {
        check(await sb.from('tournament_teams').delete().eq('tournament_id', id));
        if (f.teamIds.length) check(await sb.from('tournament_teams').insert(f.teamIds.map((t) => ({ tournament_id: id, team_id: t }))));
      }
      const n = f.teamIds?.length ?? (await sb.from('tournament_teams').select('team_id', { count: 'exact', head: true }).eq('tournament_id', id)).count ?? 0;
      if ((f.teamIds || f.structure || f.groupCount) && n >= 2) check(await sb.rpc('draw_tournament', { p_id: id }));
    },
    async applyTeam(teamId, message) { check(await sb.rpc('apply_team', { p_team: teamId, p_message: message })); },
    async cancelApplication(id) { check(await sb.rpc('cancel_application', { p_id: id })); },
    async respondApplication(id, accept) { return check(await sb.rpc('respond_application', { p_id: id, p_accept: accept })) as string; },
    async saveLineup(teamId, format, formation, slots) { check(await sb.rpc('save_lineup', { p_team: teamId, p_format: format, p_formation: formation, p_slots: slots })); },
    async setMyName(name) { check(await sb.rpc('set_my_name', { p_name: name })); },
    async deleteUser(userId, deletePlayer) { check(await sb.rpc('delete_user', { p_user: userId, p_delete_player: deletePlayer })); },
    async setMom(matchId, playerId) { check(await sb.rpc('set_mom', { p_match: matchId, p_player: playerId })); },
    async registerTournament(id, join) { check(await sb.rpc('register_tournament', { p_id: id, p_join: join })); },
    async deleteTournament(id) {
      const rows = check(await sb.from('tournaments').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('Chỉ Ban tổ chức được xóa giải đấu.');
    },
    async drawTournament(id) { check(await sb.rpc('draw_tournament', { p_id: id })); },
    async addAward(a) {
      check(await sb.from('tournament_awards').insert({
        tournament_id: a.tournamentId, kind: a.kind, title: a.title.trim(), team_id: a.teamId, player_id: a.playerId, player_name: a.playerName, note: a.note || null,
      }));
    },
    async deleteAward(id) { check(await sb.from('tournament_awards').delete().eq('id', id)); },
    async cancelMatch(id, reason) { check(await sb.rpc('cancel_match', { p_match: id, p_reason: reason })); },
    async stopSeries(seriesId) {
      const rows = check(await sb.from('match_series').update({ active: false }).eq('id', seriesId).select('id'));
      if (!rows.length) throw new Error('Chỉ Ban tổ chức được dừng lịch cố định.');
    },
    async saveResult(id, hs, as, scorers) { check(await sb.rpc('save_result', { p_match: id, p_hs: hs, p_as: as, p_scorers: scorers })); },
    async deleteMatch(id) {
      const rows = check(await sb.from('matches').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('Chỉ Ban tổ chức được xóa trận.');
    },
    async joinMatch(matchId, teamId) { check(await sb.rpc('join_match', { p_match: matchId, p_team: teamId })); },
    async leaveMatch(matchId) { check(await sb.rpc('leave_match', { p_match: matchId })); },
    async submitStats(matchId, s) {
      check(await sb.rpc('submit_match_stats', {
        p_match: matchId, p_goals: s.goals, p_assists: s.assists, p_saves: s.saves, p_yellow: s.yellow, p_red: s.red, p_rating: s.rating, p_note: s.note,
      }));
    },
    async reviewStats(matchId, playerId, approve) { check(await sb.rpc('review_match_stats', { p_match: matchId, p_player: playerId, p_approve: approve })); },
    async voteWinner(matchId, key) { check(await sb.rpc('vote_winner', { p_match: matchId, p_winner: key })); },
    async voteScore(matchId, score) { check(await sb.rpc('vote_score', { p_match: matchId, p_score: score })); },

    async signPlayer(pid, teamId) { check(await sb.rpc('sign_player', { p_player: pid, p_team: teamId })); },
    async releasePlayer(pid) { check(await sb.rpc('release_player', { p_player: pid })); },
    async transferPlayer(pid, to, fee) { check(await sb.rpc('transfer_player', { p_player: pid, p_to: to, p_fee: fee })); },
    async makeOffer(pid, price, note) { check(await sb.rpc('make_offer', { p_player: pid, p_price: price, p_note: note })); },
    async respondOffer(id, accept) { return check(await sb.rpc('respond_offer', { p_offer: id, p_accept: accept })) as string; },
    async cancelOffer(id) { check(await sb.rpc('cancel_offer', { p_offer: id })); },
  };
}
