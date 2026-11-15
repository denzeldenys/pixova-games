import type { ComponentType } from 'react';

/** A seat in a room. Shared by every game; games only ever see ids. */
export interface Player {
  id: string;
  name: string;
  /** Index into the shared avatar palette (0-7). */
  color: number;
  isBot: boolean;
  isHost: boolean;
  /** false when a human dropped out and a bot is temporarily playing for them. */
  connected: boolean;
}

/** Context handed to game logic so it can stay pure and testable (no Date.now / Math.random inside). */
export interface GameContext {
  now: number;
  random: () => number;
}

export interface RankEntry {
  playerId: string;
  /** 1 = winner. Equal ranks are allowed for shared places. */
  rank: number;
  /** Optional short text shown next to the player, e.g. "Space 24". */
  detail?: string;
}

export interface GameComponentProps<V = unknown, A = unknown> {
  /** What this player is allowed to see (from getPlayerView). */
  view: V;
  /** Send an action to the host; it runs through applyAction there. */
  sendAction: (action: A) => void;
  /** The local player's id. */
  myId: string;
  /** Everyone in the room (names, colours, bot status). */
  players: Player[];
}

/**
 * Everything a game must provide. One object per game, exported from src/games/<id>/index.ts
 * and registered in src/games/registry.ts. The shared shell handles rooms, lobby, networking,
 * bots, reactions and results; games only describe their own rules and view.
 */
export interface GameDefinition<S = any, A = any, V = any> {
  id: string;
  name: string;
  description: string;
  /** URL of a square-ish icon or an emoji. */
  icon: string;
  /** Optional cover art URL for the home screen card. */
  cover?: string;
  minPlayers: number;
  maxPlayers: number;

  createInitialState(players: Player[], ctx: GameContext): S;
  /** Pure: returns a new state. Runs on the host only. Return the same state to ignore an action. */
  applyAction(state: S, action: A, playerId: string, ctx: GameContext): S;
  /** Hide secret information from this player. */
  getPlayerView(state: S, playerId: string): V;
  /** An action for a bot seat, or null if the bot has nothing to do right now. */
  botAction(state: S, botId: string, ctx: GameContext): A | null;
  /** The game's screen. Can be React.lazy so game code loads only when played. */
  Component: ComponentType<GameComponentProps<V, A>>;

  /** Optional: called by the host every ~250 ms for timers and phase changes. Return the same state if nothing changed. */
  tick?(state: S, ctx: GameContext): S;
  /** Optional: final ranking once the game is over, otherwise null. */
  getResults?(state: S): RankEntry[] | null;
  /** Optional: lazily-loaded background music URL for this game. */
  music?: string;
  /** Optional: sounds the shared results screen plays. */
  resultSounds?: { win?: string; lose?: string };
}
