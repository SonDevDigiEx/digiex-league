import type { Slot } from '../lib/formation';
import type { Award, Goal, MatchInput, PlayerInput, Pos, Profile, Role, Snapshot, StatsInput, TeamInput, Tournament, TournamentInput, ValueFactors, WinnerKey, XpEvent } from '../lib/types';

/**
 * Everything the UI reads or writes goes through this interface (implemented by supabaseApi.ts).
 * Permission checks live on the server (Supabase RLS / RPCs); the UI only hides actions a user can't take.
 * Methods throw an Error with a user-facing (Vietnamese) message on failure.
 */
export interface Api {
  load(): Promise<Snapshot>;
  /** Called whenever data changes elsewhere (other users, auth state). Returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void;

  currentUser(): Promise<Profile | null>;
  /** Redirects to Google; the session is picked up when the browser comes back. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Set the signed-in user's photo (profile + their player card); null = back to the Google photo. */
  setMyPhoto(image: Blob | null): Promise<void>;
  /** Error returned by the OAuth redirect (e.g. non-company account), consumed once. */
  takeAuthError(): string | null;

  createTeam(input: TeamInput): Promise<{ id: string }>;
  updateTeam(teamId: string, input: TeamInput): Promise<void>;
  setTeamLogo(teamId: string, image: Blob | null): Promise<void>;
  setMember(userId: string, role: Role, teamId: string | null): Promise<void>;
  /** The chairman hands the role to a player (with an account) or the BHL of the same team. */
  handoverChair(userId: string): Promise<void>;
  /** A player changes their own jersey number (0–999, unique in the league). */
  setMyNumber(num: number): Promise<void>;
  /** A player sets their 1–3 preferred positions (first = primary; OVR is recomputed). */
  setMyPositions(positions: Pos[]): Promise<void>;
  setTeamCover(teamId: string, image: Blob | null): Promise<void>;
  /** Admin: create a tournament with its teams and run the draw. Returns the id. */
  createTournament(input: TournamentInput): Promise<string>;
  /** Admin: edit details; changing the team list re-runs the draw. */
  updateTournament(id: string, input: Partial<TournamentInput> & { status?: Tournament['status'] }): Promise<void>;
  deleteTournament(id: string): Promise<void>;
  drawTournament(id: string): Promise<void>;
  /** Chair: register / withdraw the own team (upcoming tournaments only). */
  registerTournament(id: string, join: boolean): Promise<void>;
  /** Admin or either team's chairman: Man of the Match (null clears). */
  setMom(matchId: string, playerId: string | null): Promise<void>;
  /** Own display name (also on the player / team card); once every 24 h. */
  setMyName(name: string): Promise<void>;
  /** Latest XP events of a player (members only). */
  xpHistory(playerId: string): Promise<XpEvent[]>;
  /** Chairman: weekly "thưởng nóng" +30 XP to a player of their team. */
  hotBonus(playerId: string): Promise<string>;
  /** Mark the given notifications (or all) as read. */
  markNotificationsRead(ids?: number[]): Promise<void>;
  /** Chairman / BHL / admin: save the team's starting lineup for S5 or S7. */
  saveLineup(teamId: string, format: 's5' | 's7', formation: string, slots: Slot[]): Promise<void>;
  /** Free agent: apply to join a team (the team's chairman decides). */
  applyTeam(teamId: string, message: string): Promise<void>;
  cancelApplication(id: string): Promise<void>;
  /** Chairman of the team (or admin): accept / reject; returns a message. */
  respondApplication(id: string, accept: boolean): Promise<string>;
  /** Admin: delete an account; optionally its player card too. */
  deleteUser(userId: string, deletePlayer: boolean): Promise<void>;
  addAward(award: Omit<Award, 'id'>): Promise<void>;
  deleteAward(id: string): Promise<void>;
  /** Why a player is worth what they're worth. */
  valueFactors(playerId: string): Promise<ValueFactors>;
  /** Reject a pending sign-up (deletes the account). */
  rejectMember(userId: string): Promise<void>;
  /**
   * Approve a pending account (or complete an existing one): set its staff role and optionally
   * create a linked player profile (player.teamId null = free agent).
   */
  approveMember(userId: string, role: Role, roleTeam: string | null, player: Omit<PlayerInput, 'id'> | null): Promise<void>;

  /** Upload a player photo and return its URL (stored on the player when the form is saved). */
  uploadPlayerPhoto(teamId: string | null, image: Blob): Promise<string>;
  savePlayer(input: PlayerInput): Promise<void>;
  deletePlayer(id: string): Promise<void>;

  scheduleMatch(input: MatchInput): Promise<void>;
  saveResult(id: string, hs: number, as: number, scorers: Goal[]): Promise<void>;
  deleteMatch(id: string): Promise<void>;
  /** Cancel an upcoming match (admin or either chairman). */
  cancelMatch(id: string, reason: string): Promise<void>;
  /** Stop a weekly fixture from creating further matches (admin). */
  stopSeries(seriesId: string): Promise<void>;
  /** Register the signed-in player for a match; teamId is only used by free agents. */
  joinMatch(matchId: string, teamId: string | null): Promise<void>;
  leaveMatch(matchId: string): Promise<void>;
  /** Participant reports their own stats after the match. */
  submitStats(matchId: string, stats: StatsInput): Promise<void>;
  /** Team staff approve/reject a participant's submitted stats. */
  reviewStats(matchId: string, playerId: string, approve: boolean): Promise<void>;
  voteWinner(matchId: string, key: WinnerKey): Promise<void>;
  voteScore(matchId: string, score: string): Promise<void>;

  transferPlayer(playerId: string, toTeam: string, fee: number): Promise<void>;
  /** Sign a free agent. */
  signPlayer(playerId: string, teamId: string): Promise<void>;
  /** Release a player to free agency. */
  releasePlayer(playerId: string): Promise<void>;
  makeOffer(playerId: string, price: number, note: string): Promise<void>;
  respondOffer(offerId: string, accept: boolean): Promise<string>;
  cancelOffer(offerId: string): Promise<void>;
}
