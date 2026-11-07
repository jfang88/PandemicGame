export const COLORS = ['blue', 'yellow', 'red', 'black'] as const;
export const ROLES = ['medic', 'scientist', 'builder', 'courier'] as const;
export const RULES_VERSION = 'containment-v1' as const;
export const BOARD_VERSION = 'grid48-v1' as const;
export type Color = typeof COLORS[number];
export type Role = typeof ROLES[number];
export type LocationId = string;
export type LocationCardId = `p:${string}`;
export type InfectionCardId = `i:${string}`;
export type EpidemicCardId = `e:${1 | 2 | 3 | 4}`;
export type PlayerCardId = LocationCardId | EpidemicCardId;
export type ColorMap<T> = Readonly<Record<Color, T>>;
export interface BoardLocation {
  readonly id: LocationId;
  readonly name: string;
  readonly color: Color;
  readonly x: number;
  readonly y: number;
  readonly neighbors: readonly LocationId[];
}
export interface Board {
  readonly boardVersion: typeof BOARD_VERSION;
  readonly startLocation: 'A01';
  readonly width: number;
  readonly height: number;
  readonly locations: readonly BoardLocation[];
}
export interface RosterPlayer {
  readonly userId: string;
  readonly seat: number;
  readonly role: Role;
}
export interface PlayerState extends RosterPlayer {
  readonly locationId: LocationId;
  readonly hand: readonly LocationCardId[];
}
export interface GameConfig {
  readonly players: readonly RosterPlayer[];
  readonly rulesVersion?: typeof RULES_VERSION;
  readonly boardVersion?: typeof BOARD_VERSION;
  readonly board?: unknown;
}
export type Phase = 'ACTIONS' | 'DRAW' | 'DISCARD_REQUIRED' | 'INFECTION' | 'WON' | 'LOST';
export type Continuation = {
  readonly userId: string;
  readonly resume: { readonly phase: 'ACTIONS'; readonly actionsRemaining: number }
    | { readonly phase: 'DRAW'; readonly drawsRemaining: number };
};
export type Outcome = { readonly kind: 'won' }
  | { readonly kind: 'lost'; readonly reason: 'PLAYER_DECK_EMPTY' | 'OUTBREAK_LIMIT' }
  | { readonly kind: 'lost'; readonly reason: 'CUBE_SUPPLY_EXHAUSTED'; readonly color: Color; readonly locationId: LocationId };
/** Internal state only. Never send decks or rngState to a browser. Revision belongs to the room. */
export interface GameState {
  readonly schemaVersion: 1;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly boardVersion: typeof BOARD_VERSION;
  readonly phase: Phase;
  readonly players: readonly PlayerState[];
  readonly activeSeat: number;
  readonly actionsRemaining: number;
  readonly cubes: Readonly<Record<LocationId, ColorMap<number>>>;
  readonly supply: ColorMap<number>;
  readonly centers: readonly LocationId[];
  readonly cured: ColorMap<boolean>;
  readonly outbreakCount: number;
  readonly rateIndex: number;
  readonly playerDeck: readonly PlayerCardId[];
  readonly playerDiscard: readonly LocationCardId[];
  readonly infectionDeck: readonly InfectionCardId[];
  readonly infectionDiscard: readonly InfectionCardId[];
  readonly resolvedEpidemics: readonly EpidemicCardId[];
  readonly rngState: number;
  readonly continuation: Continuation | null;
  readonly outcome: Outcome | null;
}
