import type { Goal, MatchInput, PlayerInput, Profile, Role, Snapshot, StatsInput, TeamInput, WinnerKey } from '../lib/types';

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
