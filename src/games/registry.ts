import type { GameDefinition } from '../core/types';
import clashRace from './clash-race';

/**
 * Every playable game. To add one: create src/games/<id>/index.ts exporting a GameDefinition
 * and add it to this list. Nothing else in the app needs to change.
 */
export const GAMES: GameDefinition[] = [
  clashRace,
];

export const getGame = (id: string) => GAMES.find((g) => g.id === id);
