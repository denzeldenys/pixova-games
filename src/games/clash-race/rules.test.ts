import { describe, expect, it } from 'vitest';
import type { Player } from '../../core/types';
import {
  applyAction, botAction, createInitialState, getPlayerView, getResults, lastCheckpoint,
  maxPickFor, PICK_MS, resolveRound, tick, type ClashState,
} from './rules';

const ctx = (now = 0, rnd = 0.5) => ({ now, random: () => rnd });
const players = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: i, isBot: false, isHost: i === 0, connected: true }));

describe('resolveRound', () => {
  it('moves a player with a unique number forward by that many spaces', () => {
    const r = resolveRound({ a: 0, b: 0 }, { a: 3, b: 5 });
    expect(r.after).toEqual({ a: 3, b: 5 });
    expect(r.clashed).toEqual([]);
  });

  it('players who pick the same number clash and do not move', () => {
    const r = resolveRound({ a: 2, b: 4, c: 0 }, { a: 4, b: 4, c: 1 });
    expect(r.clashed.sort()).toEqual(['a', 'b']);
    expect(r.after).toEqual({ a: 2, b: 4, c: 1 });
  });

  it('landing on an occupied space knocks that player back to their last checkpoint', () => {
    // b clashes with c and stays on 14; a moves 10 -> 14 and knocks b back to checkpoint 12
    const r = resolveRound({ a: 10, b: 14, c: 3 }, { a: 4, b: 2, c: 2 });
    expect(r.after.a).toBe(14);
    expect(r.after.b).toBe(12);
    expect(r.knockbacks).toEqual([{ id: 'b', from: 14, to: 12, by: 'a' }]);
  });

  it('a knocked-back player with no checkpoint behind them returns to Start', () => {
    const r = resolveRound({ a: 0, b: 4, c: 1 }, { a: 4, b: 1, c: 1 });
    expect(r.after.b).toBe(0);
  });

  it('checkpoints are safe: players can share them and nobody is knocked back', () => {
    const r = resolveRound({ a: 3, b: 6, c: 0 }, { a: 3, b: 1, c: 1 });
    expect(r.after).toEqual({ a: 6, b: 6, c: 0 });
    expect(r.knockbacks).toEqual([]);
  });

  it('two movers on the same space: the higher number keeps it, the other is knocked back', () => {
    const r = resolveRound({ a: 5, b: 7 }, { a: 4, b: 2 }); // both land on 9
    expect(r.after.a).toBe(9);
    expect(r.after.b).toBe(6); // last checkpoint at or behind 9
    expect(r.knockbacks).toEqual([{ id: 'b', from: 9, to: 6, by: 'a' }]);
  });

  it('two movers sharing a checkpoint are both safe', () => {
    const r = resolveRound({ a: 2, b: 3 }, { a: 4, b: 3 });
    expect(r.after).toEqual({ a: 6, b: 6 });
    expect(r.knockbacks).toEqual([]);
  });

  it('reaching or passing 30 wins', () => {
    const r = resolveRound({ a: 27, b: 10 }, { a: 3, b: 5 });
    expect(r.winners).toEqual(['a']);
    expect(r.after.a).toBe(30);
  });

  it('win tie-break: furthest past the finish wins', () => {
    const r = resolveRound({ a: 28, b: 27 }, { a: 2, b: 5 }); // a lands 30, b lands 32
    expect(r.winners).toEqual(['b']);
  });

  it('win tie-break: equal overshoot shares the win', () => {
    const r = resolveRound({ a: 29, b: 28, c: 0 }, { a: 2, b: 3, c: 1 }); // both reach 31
    expect(r.winners.sort()).toEqual(['a', 'b']);
  });

  it('lastCheckpoint', () => {
    expect([0, 5, 6, 11, 12, 23, 24, 29].map(lastCheckpoint)).toEqual([0, 0, 6, 6, 12, 18, 24, 24]);
  });
});

describe('game flow', () => {
  it('N = max(5, players + 1)', () => {
    expect(maxPickFor(2)).toBe(5);
    expect(maxPickFor(4)).toBe(5);
    expect(maxPickFor(5)).toBe(6);
    expect(maxPickFor(8)).toBe(9);
  });

  it('hides picks until reveal and resolves when everyone has locked in', () => {
    let s = createInitialState(players(3), ctx());
    s = applyAction(s, { type: 'pick', n: 2 }, 'p0', ctx());
    const v = getPlayerView(s, 'p1');
    expect(v.lockedIn).toEqual(['p0']);
    expect(v.myPick).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"p0":2');
    // cannot change a locked pick or pick out of range
    expect(applyAction(s, { type: 'pick', n: 3 }, 'p0', ctx())).toBe(s);
    expect(applyAction(s, { type: 'pick', n: 99 }, 'p1', ctx())).toBe(s);
    s = applyAction(s, { type: 'pick', n: 3 }, 'p1', ctx());
    s = applyAction(s, { type: 'pick', n: 4 }, 'p2', ctx());
    expect(s.phase).toBe('reveal');
    expect(s.positions).toEqual({ p0: 2, p1: 3, p2: 4 });
  });

  it('the timer auto-picks for anyone who has not picked', () => {
    let s = createInitialState(players(2), ctx(0));
    s = applyAction(s, { type: 'pick', n: 1 }, 'p0', ctx());
    s = tick(s, ctx(PICK_MS + 1, 0.99));
    expect(s.phase).toBe('reveal');
    expect(s.last!.autoPicked).toEqual(['p1']);
    expect(s.last!.picks.p1).toBe(5);
  });

  it('plays a full bot game to a result', () => {
    let s: ClashState = createInitialState(players(4), ctx(0));
    let now = 0;
    let rnd = 1;
    const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000 && s.phase !== 'over'; i++) {
      now += 500;
      for (const id of s.playerIds) {
        const a = botAction(s, id, { now, random });
        if (a) s = applyAction(s, a, id, { now, random });
      }
      s = tick(s, { now, random });
    }
    expect(s.phase).toBe('over');
    const res = getResults(s)!;
    expect(res[0].rank).toBe(1);
    expect(res).toHaveLength(4);
  });
});
