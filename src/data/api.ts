import type { Goal, MatchInput, PlayerInput, Profile, Role, Snapshot, TeamInput, WinnerKey } from '../lib/types';

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
  /** Error returned by the OAuth redirect (e.g. non-company account), consumed once. */
  takeAuthError(): string | null;

  createTeam(input: TeamInput): Promise<{ id: string }>;
  updateTeam(teamId: string, input: TeamInput): Promise<void>;
  setTeamLogo(teamId: string, image: Blob | null): Promise<void>;
  setMember(userId: string, role: Role, teamId: string | null): Promise<void>;
  /** Reject a pending sign-up (deletes the account). */
  rejectMember(userId: string): Promise<void>;

  /** Upload a player photo and return its URL (stored on the player when the form is saved). */
  uploadPlayerPhoto(teamId: string, image: Blob): Promise<string>;
  savePlayer(input: PlayerInput): Promise<void>;
  deletePlayer(id: string): Promise<void>;

  scheduleMatch(input: MatchInput): Promise<void>;
  saveResult(id: string, hs: number, as: number, scorers: Goal[]): Promise<void>;
  deleteMatch(id: string): Promise<void>;
  voteWinner(matchId: string, key: WinnerKey): Promise<void>;
  voteScore(matchId: string, score: string): Promise<void>;

  transferPlayer(playerId: string, toTeam: string, fee: number): Promise<void>;
  makeOffer(playerId: string, price: number, note: string): Promise<void>;
  respondOffer(offerId: string, accept: boolean): Promise<string>;
  cancelOffer(offerId: string): Promise<void>;
}
