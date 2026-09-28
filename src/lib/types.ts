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
}

export interface Player {
  id: string;
  /** null = free agent (Tự do) */
  teamId: string | null;
  /** Linked account when the player was created by approving a sign-up. */
  userId: string | null;
  name: string;
  pos: Pos;
  ovr: number;
  num: number;
  age: number;
  foot: Foot;
  /** PAC SHO PAS DRI DEF PHY (or DIV HAN KIC REF SPD POS for GK) */
  stats: number[];
  value: number;
  photo?: string | null;
}

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
  venue: string;
  scorers: Goal[];
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
}
