import type { Lineup } from './formation';
/** 'pending' = signed in but not yet approved by an admin (sees only what guests see). */
export type Role = 'admin' | 'chair' | 'coach' | 'member' | 'pending';
export type Pos = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LW' | 'RW' | 'ST';
export type Group = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Foot = 'Phải' | 'Trái';
export type WinnerKey = 'home' | 'draw' | 'away';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface Team {
  id: string;
  name: string;
  short: string;
  color: string;
  color2: string;
  motto: string;
  founded: number;
  chair: { name: string; since: string; quote: string };
  coach: { name: string };
  logo?: string | null;
  cover?: string | null;
}

export interface Player {
  id: string;
  /** null = free agent (Tự do) */
  teamId: string | null;
  /** Linked account when the player was created by approving a sign-up. */
  userId: string | null;
  name: string;
  /** Primary position (= positions[0]). */
  pos: Pos;
  /** 1–3 preferred positions, primary first. */
  positions: Pos[];
  /** Computed by the server from the primary position + stats. */
  ovr: number;
  num: number;
  age: number;
  foot: Foot;
  /** PAC SHO PAS DRI DEF PHY (or DIV HAN KIC REF SPD POS for GK) */
  stats: number[];
  value: number;
  photo?: string | null;
  /** Lifetime XP (net) and per-stat progress toward the next point. */
  xp?: number;
  statXp?: number[];
  /** Stats when the player joined (or at the last reset) — for the progress ranking. */
  baseStats?: number[] | null;
}

export interface XpEvent { id: number; matchId: string | null; kind: string; amount: number; dist: number[]; note: string | null; date: string }

export interface Goal {
  pid: string;
  side: 'home' | 'away';
  /** Minute, when recorded. */
  min?: number;
}

export interface Match {
  id: string;
  /** ISO date-time */
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  status: 'up' | 'done' | 'cancelled';
  /** Set when status is 'cancelled'. */
  cancelReason: string | null;
  /** Weekly fixed fixture this match belongs to. */
  seriesId: string | null;
  tournamentId: string | null;
  /** e.g. "Bảng A", "Bán kết" */
  stage: string | null;
  venue: string;
  scorers: Goal[];
  /** Man of the Match (player id), picked by staff after the match. */
  mom: string | null;
  /** Aggregated winner votes */
  votes: Record<WinnerKey, number>;
  /** Aggregated score predictions, e.g. {"2-1": 8} */
  sv: Record<string, number>;
}

export interface Transfer {
  pid: string | null;
  name: string;
  /** null = signed as a free agent */
  from: string | null;
  /** null = released to free agency */
  to: string | null;
  fee: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface Offer {
  id: string;
  pid: string;
  /** buying team */
  from: string;
  /** selling team (current owner); null = invitation to a free agent (the player answers) */
  to: string | null;
  price: number;
  value: number;
  note: string;
  byName: string;
  status: OfferStatus;
  /** YYYY-MM-DD */
  date: string;
}

export interface Profile {
  id: string;
  username: string;
  name: string;
  role: Role;
  team: string | null;
  email: string;
  avatar: string | null;
  /** Last self rename (limit: once every 24 h). */
  nameChangedAt: string | null;
}

export type StatsStatus = 'none' | 'submitted' | 'approved' | 'rejected';

/** A player registered for a match (RSVP) and, after it, their self-reported stats. */
export interface Participation {
  matchId: string;
  playerId: string;
  /** Side they play for (their team, or the side a free agent chose). */
  teamId: string;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  yellow: number | null;
  red: number | null;
  rating: number | null;
  note: string | null;
  status: StatsStatus;
  /** Marked by the chairman after the match. */
  attendance?: 'present' | 'late' | 'no_show';
}

export interface StatsInput {
  goals: number;
  assists: number;
  saves: number;
  yellow: number;
  red: number;
  rating: number | null;
  note: string;
}

export interface MyVote {
  winner?: WinnerKey;
  score?: string;
}

export interface Snapshot {
  teams: Team[];
  players: Player[];
  matches: Match[];
  transfers: Transfer[];
  offers: Offer[];
  my: Record<string, MyVote>;
  /** Everyone with an account (signed-in viewers only). */
  members: Profile[];
  participants: Participation[];
  series: Series[];
  /** Daily market value per player (last ~5 weeks), oldest first. */
  valueHistory: Record<string, { day: string; value: number }[]>;
  tournaments: Tournament[];
  awards: Award[];
  /** Free agents' applications to join a team (signed-in viewers only). */
  applications: Application[];
  /** Saved starting lineups (team × S5/S7). */
  lineups: Lineup[];
  /** The signed-in user's notifications, newest first. */
  notifications: Notice[];
  /** Players who answered "Bận" (can't make it) for an upcoming match. */
  busy: Busy[];
}

export interface Busy { matchId: string; playerId: string; teamId: string | null; reason: string | null; date: string }

export interface Notice {
  id: number;
  kind: 'match' | 'tournament' | 'xp' | 'application' | string;
  title: string;
  body: string | null;
  link: string | null;
  meta: { xp?: number; notes?: string[]; ups?: string[] };
  date: string;
  read: boolean;
}

export interface Application {
  id: string;
  playerId: string;
  teamId: string;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  /** ISO date-time */
  date: string;
}

export interface TournamentSettings {
  weeks: number; stages: number; squadMin: number; squadMax: number; starters: number; halves: number; halfMin: string;
  pts: { win: number; draw: number; loss: number; shootoutWin: number; shootoutLoss: number; closeLossBonus: number; noShow: number };
  personal: { attend: number; goal: number; assist: number; mvp: number; cleanSheet: number; absent: number };
}

export interface Tournament {
  id: string;
  name: string;
  format: 's5' | 's7';
  structure: 'league' | 'groups' | 'knockout';
  groupCount: number;
  status: 'upcoming' | 'ongoing' | 'finished';
  startsOn: string | null;
  endsOn: string | null;
  settings: TournamentSettings;
  rulesMd: string;
  /** Knockout rounds: [[{home, away}]] (team ids, null = bye / TBD). */
  bracket: { home: string | null; away: string | null }[][] | null;
  drawnAt: string | null;
  /** Participating teams in draw order. */
  teams: { teamId: string; group: string | null; seed: number | null }[];
}

export interface TournamentInput {
  name: string;
  format: 's5' | 's7';
  structure: 'league' | 'groups' | 'knockout';
  groupCount: number;
  startsOn: string | null;
  endsOn: string | null;
  settings: TournamentSettings;
  rulesMd: string;
  teamIds: string[];
}

export interface Award {
  id: string;
  tournamentId: string;
  kind: string;
  title: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  note: string | null;
}

/** Breakdown of a player's market value (public.value_factors). */
export interface ValueFactors {
  value: number; base: number; age: number; position: number; form: number; attendance: number; hot: number; floor: number | null;
  matches: number; goals: number; assists: number; rating: number | null; red: number; played: number | null; teamMatches: number | null; offers: number;
}

/** A weekly fixed fixture; the next match is created automatically when the latest one is over. */
export interface Series {
  id: string;
  home: string;
  away: string;
  venue: string;
  active: boolean;
}

export interface PlayerInput {
  id?: string;
  teamId: string | null;
  name: string;
  pos: Pos;
  positions: Pos[];
  ovr: number;
  num: number;
  age: number;
  foot: Foot;
  stats: number[];
  photo: string | null;
}

export interface TeamInput {
  name: string;
  short: string;
  motto: string;
  chairQuote?: string;
  color: string;
  color2: string;
}

export interface MatchInput {
  home: string;
  away: string;
  date: string;
  venue: string;
  /** Repeat every week. */
  weekly?: boolean;
  tournamentId?: string | null;
  stage?: string;
}
