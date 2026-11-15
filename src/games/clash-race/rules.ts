import type { GameContext, Player, RankEntry } from '../../core/types';

export const FINISH = 30;
export const CHECKPOINTS = [6, 12, 18, 24];
export const PICK_MS = 15_000;
export const REVEAL_MS = 5_600;

export type Phase = 'picking' | 'reveal' | 'over';

export interface Knockback { id: string; from: number; to: number; by: string }

export interface RoundResult {
  round: number;
  picks: Record<string, number>;
  /** Players who ran out of time and got a random number. */
  autoPicked: string[];
  before: Record<string, number>;
  /** Players whose number was not unique. */
  clashed: string[];
  /** Movers -> raw landing space (may exceed FINISH). */
  landed: Record<string, number>;
  knockbacks: Knockback[];
  after: Record<string, number>;
  winners: string[];
}

export interface ClashState {
  playerIds: string[];
  positions: Record<string, number>;
  picks: Record<string, number>;
  round: number;
  phase: Phase;
  maxPick: number;
  deadline: number;
  revealUntil: number;
  last: RoundResult | null;
  winners: string[];
}

export type ClashAction = { type: 'pick'; n: number };

export interface ClashView {
  phase: Phase;
  round: number;
  maxPick: number;
  /** ms left to pick when this view was produced (clients count down locally). */
  msLeft: number;
  playerIds: string[];
  positions: Record<string, number>;
  lockedIn: string[];
  myPick: number | null;
  last: RoundResult | null;
  winners: string[];
}

export const isCheckpoint = (s: number) => CHECKPOINTS.includes(s);
export const maxPickFor = (playerCount: number) => Math.max(5, playerCount + 1);

/** The last checkpoint at or behind a space (Start = 0). */
export function lastCheckpoint(space: number) {
  let c = 0;
  for (const cp of CHECKPOINTS) if (cp <= space) c = cp;
  return c;
}

/** Safe spaces: Start, checkpoints and the finish line can be shared. */
const isSafe = (s: number) => s <= 0 || s >= FINISH || isCheckpoint(s);

/** Core round resolution. Pure; exported for tests. */
export function resolveRound(positions: Record<string, number>, picks: Record<string, number>) {
  const ids = Object.keys(picks);
  const count = new Map<number, number>();
  for (const id of ids) count.set(picks[id], (count.get(picks[id]) ?? 0) + 1);

  const movers = ids.filter((id) => count.get(picks[id]) === 1);
  const clashed = ids.filter((id) => count.get(picks[id])! > 1);
  const landed: Record<string, number> = {};
  for (const id of movers) landed[id] = positions[id] + picks[id];

  const after: Record<string, number> = { ...positions };
  for (const id of movers) after[id] = Math.min(FINISH, landed[id]);

  const knockbacks: Knockback[] = [];
  const knocked = new Set<string>();

  // 1. Two or more movers on the same unsafe space: the higher number keeps it.
  const bySpace = new Map<number, string[]>();
  for (const id of movers) {
    if (isSafe(landed[id])) continue;
    bySpace.set(landed[id], [...(bySpace.get(landed[id]) ?? []), id]);
  }
  for (const [space, group] of bySpace) {
    if (group.length < 2) continue;
    const keeper = group.reduce((a, b) => (picks[b] > picks[a] ? b : a));
    for (const id of group) {
      if (id === keeper) continue;
      const to = lastCheckpoint(space);
      knockbacks.push({ id, from: space, to, by: keeper });
      knocked.add(id);
      after[id] = to;
    }
  }

  // 2. A mover landing on a player who did not move knocks them back.
  const stationary = ids.filter((id) => !movers.includes(id));
  for (const m of movers) {
    const space = landed[m];
    if (knocked.has(m) || isSafe(space)) continue;
    for (const s of stationary) {
      if (positions[s] === space && !knocked.has(s)) {
        const to = lastCheckpoint(space);
        knockbacks.push({ id: s, from: space, to, by: m });
        knocked.add(s);
        after[s] = to;
      }
    }
  }

  // 3. Winners: whoever reached or passed the finish; furthest past wins, exact ties share.
  const finishers = movers.filter((id) => landed[id] >= FINISH);
  const best = Math.max(-Infinity, ...finishers.map((id) => landed[id]));
  const winners = finishers.filter((id) => landed[id] === best);

  return { clashed, landed, knockbacks, after, winners };
}

export function createInitialState(players: Player[], ctx: GameContext): ClashState {
  const ids = players.map((p) => p.id);
  return {
    playerIds: ids,
    positions: Object.fromEntries(ids.map((id) => [id, 0])),
    picks: {},
    round: 1,
    phase: 'picking',
    maxPick: maxPickFor(ids.length),
    deadline: ctx.now + PICK_MS,
    revealUntil: 0,
    last: null,
    winners: [],
  };
}

function finishRound(state: ClashState, ctx: GameContext): ClashState {
  const picks = { ...state.picks };
  const autoPicked: string[] = [];
  for (const id of state.playerIds) {
    if (picks[id] == null) {
      picks[id] = 1 + Math.floor(ctx.random() * state.maxPick);
      autoPicked.push(id);
    }
  }
  const r = resolveRound(state.positions, picks);
  return {
    ...state,
    picks: {},
    positions: r.after,
    phase: 'reveal',
    revealUntil: ctx.now + REVEAL_MS + (r.knockbacks.length ? 600 : 0),
    winners: r.winners,
    last: { round: state.round, picks, autoPicked, before: state.positions, ...r },
  };
}

export function applyAction(state: ClashState, action: ClashAction, playerId: string, ctx: GameContext): ClashState {
  if (state.phase !== 'picking' || action?.type !== 'pick') return state;
  if (!state.playerIds.includes(playerId) || state.picks[playerId] != null) return state;
  const n = action.n;
  if (!Number.isInteger(n) || n < 1 || n > state.maxPick) return state;
  const next = { ...state, picks: { ...state.picks, [playerId]: n } };
  return next.playerIds.every((id) => next.picks[id] != null) ? finishRound(next, ctx) : next;
}

export function tick(state: ClashState, ctx: GameContext): ClashState {
  if (state.phase === 'picking' && ctx.now >= state.deadline) return finishRound(state, ctx);
  if (state.phase === 'reveal' && ctx.now >= state.revealUntil) {
    if (state.winners.length) return { ...state, phase: 'over' };
    return { ...state, phase: 'picking', round: state.round + 1, deadline: ctx.now + PICK_MS };
  }
  return state;
}

export function getPlayerView(state: ClashState, playerId: string): ClashView {
  return {
    phase: state.phase,
    round: state.round,
    maxPick: state.maxPick,
    msLeft: state.phase === 'picking' ? Math.max(0, state.deadline - Date.now()) : 0,
    playerIds: state.playerIds,
    positions: state.positions,
    lockedIn: Object.keys(state.picks), // who, never what
    myPick: state.picks[playerId] ?? null,
    last: state.last,
    winners: state.winners,
  };
}

/** Bots pick at random, weighted slightly toward higher numbers. */
export function botAction(state: ClashState, botId: string, ctx: GameContext): ClashAction | null {
  if (state.phase !== 'picking' || state.picks[botId] != null) return null;
  const weights = Array.from({ length: state.maxPick }, (_, i) => 4 + i);
  let r = ctx.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return { type: 'pick', n: i + 1 };
  }
  return { type: 'pick', n: state.maxPick };
}

export function getResults(state: ClashState): RankEntry[] | null {
  if (state.phase !== 'over') return null;
  const score = (id: string) => (state.winners.includes(id) ? Infinity : state.positions[id]);
  const sorted = [...state.playerIds].sort((a, b) => score(b) - score(a));
  return sorted.map((id) => ({
    playerId: id,
    rank: 1 + sorted.filter((o) => score(o) > score(id)).length,
    detail: state.winners.includes(id) ? 'Finished!' : `Space ${state.positions[id]}`,
  }));
}
