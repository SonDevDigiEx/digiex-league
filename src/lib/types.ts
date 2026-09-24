export type Role = 'admin' | 'chair' | 'coach' | 'member';
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
  teamId: string;
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
  min: number;
}

export interface Match {
  id: string;
  /** ISO date-time */
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  status: 'up' | 'done';
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
  from: string;
  to: string;
  fee: number;
  /** YYYY-MM-DD */
  date: string;
}

export interface Offer {
  id: string;
  pid: string;
  /** buying team */
  from: string;
  /** selling team (current owner) */
  to: string;
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
}

export interface PlayerInput {
  id?: string;
  teamId: string;
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
  chair: string;
  motto: string;
  color: string;
  color2: string;
}

export interface MatchInput {
  home: string;
  away: string;
  date: string;
  venue: string;
}

export interface DemoAccount {
  u: string;
  pw: string;
  label: string;
}
