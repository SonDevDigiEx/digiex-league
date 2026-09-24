import type { DemoAccount, MatchInput, PlayerInput, Profile, Snapshot, TeamInput, WinnerKey } from '../lib/types';

/**
 * Everything the UI reads or writes goes through this interface.
 * Permission checks live on the server (Supabase RLS / RPCs); the UI only hides actions a user can't take.
 * Methods throw an Error with a user-facing (Vietnamese) message on failure.
 */
export interface Api {
  mode: 'supabase' | 'local';
  load(): Promise<Snapshot>;
  /** Called whenever data changes elsewhere (other tabs / other users). Returns an unsubscribe fn. */
  subscribe(onChange: () => void): () => void;

  currentUser(): Promise<Profile | null>;
  signIn(username: string, password: string): Promise<Profile>;
  signOut(): Promise<void>;
  demoAccounts(): DemoAccount[];

  createTeam(input: TeamInput): Promise<{ id: string; note?: string }>;
  setTeamLogo(teamId: string, image: Blob | null): Promise<void>;

  /** Upload a player photo and return its URL (stored on the player when the form is saved). */
  uploadPlayerPhoto(teamId: string, image: Blob): Promise<string>;
  savePlayer(input: PlayerInput): Promise<void>;
  deletePlayer(id: string): Promise<void>;

  scheduleMatch(input: MatchInput): Promise<void>;
  finishMatch(id: string, hs: number, as: number): Promise<void>;
  voteWinner(matchId: string, key: WinnerKey): Promise<void>;
  voteScore(matchId: string, score: string): Promise<void>;

  transferPlayer(playerId: string, toTeam: string, fee: number): Promise<void>;
  makeOffer(playerId: string, price: number, note: string): Promise<void>;
  respondOffer(offerId: string, accept: boolean): Promise<string>;
  cancelOffer(offerId: string): Promise<void>;

  /** Local mode only: restore demo data. */
  reset?(): Promise<void>;
}
