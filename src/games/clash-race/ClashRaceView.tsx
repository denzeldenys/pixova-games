import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameComponentProps } from '../../core/types';
import { colorOf } from '../../core/palette';
import { playSfx, preloadSfx } from '../../core/audio';
import { shake, vibrate } from '../../core/fx';
import { useNow } from '../../core/hooks';
import { CHECKPOINTS, FINISH, isCheckpoint, type ClashAction, type ClashView, type RoundResult } from './rules';
import trackBg from './assets/track-bg.webp';
import sLockin from './assets/lockin.mp3?url';
import sTick from './assets/tick.mp3?url';
import sReveal from './assets/reveal.mp3?url';
import sMove from './assets/move.mp3?url';
import sClash from './assets/clash.mp3?url';
import sKnock from './assets/knockback.mp3?url';
import sCheckpoint from './assets/checkpoint.mp3?url';
import './clash-race.css';

const COLS = 6;
const ROWS = 6; // 5 rows of track + the Start row

/** Board coordinates (% of the square board) for a space 0..30. Serpentine from bottom to top. */
function spaceXY(space: number) {
  if (space <= 0) return { x: 50, y: ((ROWS - 0.5) / ROWS) * 100 }; // Start is a wide lane along the bottom
  const s = Math.min(space, FINISH) - 1;
  const row = Math.floor(s / COLS); // 0 = bottom track row
  const i = s % COLS;
  const col = row % 2 === 0 ? i : COLS - 1 - i;
  const rowFromTop = ROWS - 2 - row;
  return { x: ((col + 0.5) / COLS) * 100, y: ((rowFromTop + 0.5) / ROWS) * 100 };
}

type Stage = 'idle' | 'cards' | 'flip' | 'move' | 'knock' | 'done';

export default function ClashRaceView({ view, sendAction, myId, players }: GameComponentProps<ClashView, ClashAction>) {
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const [stage, setStage] = useState<Stage>('idle');
  const [anim, setAnim] = useState<RoundResult | null>(null);
  const [disp, setDisp] = useState<Record<string, number>>(view.positions);
  const [target, setTarget] = useState<Record<string, number>>(view.positions);
  const [hopping, setHopping] = useState<Set<string>>(new Set());
  const [flying, setFlying] = useState<Set<string>>(new Set());
  const seenRound = useRef<number | null>(view.last?.round ?? null);

  useEffect(() => {
    preloadSfx([sLockin, sTick, sReveal, sMove, sClash, sKnock, sCheckpoint]);
  }, []);

  // When nothing is animating, follow the authoritative positions.
  useEffect(() => {
    if (stage === 'idle' || stage === 'done') setTarget(view.positions);
  }, [view.positions, stage]);

  // Reveal sequence for each new round result.
  useEffect(() => {
    const last = view.last;
    if (!last || last.round === seenRound.current) return;
    seenRound.current = last.round;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    setAnim(last);
    setDisp(last.before);
    setTarget(last.before);
    setStage('cards');
    playSfx(sReveal);
    at(900, () => setStage('flip'));
    if (last.clashed.length) {
      at(1350, () => { playSfx(sClash); shake(2); vibrate([90, 50, 90]); });
    }
    const landed: Record<string, number> = { ...last.before };
    for (const [id, sp] of Object.entries(last.landed)) landed[id] = Math.min(FINISH, sp);
    const longest = Math.max(0, ...Object.keys(last.landed).map((id) => landed[id] - last.before[id]));
    const moveAt = 2300;
    at(moveAt, () => {
      setStage('move');
      setTarget(landed);
      if (Object.keys(last.landed).length) playSfx(sMove, 0.7);
    });
    const knockAt = moveAt + longest * 130 + 350;
    at(knockAt, () => {
      setStage('knock');
      if (last.knockbacks.length) {
        setFlying(new Set(last.knockbacks.map((k) => k.id)));
        playSfx(sKnock);
        shake(3);
        vibrate([200, 60, 120]);
      } else if (Object.keys(last.landed).some((id) => isCheckpoint(landed[id]) && landed[id] !== last.before[id])) {
        playSfx(sCheckpoint);
      }
      setTarget(last.after);
      setDisp((d) => ({ ...d, ...Object.fromEntries(last.knockbacks.map((k) => [k.id, k.to])) }));
    });
    at(knockAt + 900, () => { setStage('done'); setFlying(new Set()); });
    return () => timers.forEach(clearTimeout);
  }, [view.last]);

  // Step pieces forward one space at a time for smooth, readable movement.
  const dispRef = useRef(disp);
  dispRef.current = disp;
  useEffect(() => {
    const t = setInterval(() => {
      const d = dispRef.current;
      const next = { ...d };
      const hop = new Set<string>();
      let changed = false;
      for (const id of Object.keys(target)) {
        const cur = d[id] ?? 0;
        const goal = target[id] ?? 0;
        if (cur < goal) { next[id] = cur + 1; changed = true; hop.add(id); }
        else if (cur > goal) { next[id] = goal; changed = true; }
      }
      if (changed) { dispRef.current = next; setDisp(next); }
      setHopping((h) => (h.size === 0 && hop.size === 0 ? h : hop));
    }, 130);
    return () => clearInterval(t);
  }, [target]);

  // Countdown
  const [receivedAt, setReceivedAt] = useState(Date.now());
  useEffect(() => setReceivedAt(Date.now()), [view]);
  const now = useNow(200, view.phase === 'picking');
  const msLeft = view.phase === 'picking' ? Math.max(0, view.msLeft - (now - receivedAt)) : 0;
  const secLeft = Math.ceil(msLeft / 1000);
  const lastTick = useRef(0);
  useEffect(() => {
    if (view.phase === 'picking' && secLeft <= 5 && secLeft > 0 && secLeft !== lastTick.current && view.myPick == null) {
      lastTick.current = secLeft;
      playSfx(sTick, 0.6);
    }
  }, [secLeft, view.phase, view.myPick]);

  const picking = view.phase === 'picking' && (stage === 'idle' || stage === 'done');
  const winnerNames = view.winners.map((id) => byId[id]?.name).join(' & ');

  // Group pieces on the same space so they can sit side by side.
  const occupants: Record<number, string[]> = {};
  for (const id of view.playerIds) (occupants[disp[id] ?? 0] ??= []).push(id);

  return (
    <div className="cr">
      <div className="cr-status">
        <span className="cr-round">Round {view.round}</span>
        {picking ? (
          <span className={`cr-timer ${secLeft <= 5 ? 'urgent' : ''}`}>⏱ {secLeft}s</span>
        ) : view.winners.length && stage === 'done' ? (
          <span className="cr-timer win">🏆 {winnerNames}</span>
        ) : (
          <span className="cr-timer">Reveal!</span>
        )}
      </div>
      {picking && <div className="cr-timebar"><div style={{ width: `${(msLeft / 15000) * 100}%` }} /></div>}

      <div className="cr-board" style={{ backgroundImage: `url(${trackBg})` }}>
        <svg className="cr-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline
            points={Array.from({ length: FINISH }, (_, s) => { const p = spaceXY(s + 1); return `${p.x},${p.y}`; }).join(' ')}
          />
        </svg>
        {Array.from({ length: FINISH + 1 }, (_, s) => {
          const p = spaceXY(s);
          const cls = s === 0 ? 'start' : s === FINISH ? 'finish' : CHECKPOINTS.includes(s) ? 'checkpoint' : '';
          return (
            <div key={s} className={`cr-space ${cls}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              {s === 0 ? 'START' : s === FINISH ? '🏁' : CHECKPOINTS.includes(s) ? <><span className="cp-flag">⛳</span><span className="cp-num">{s}</span></> : s}
            </div>
          );
        })}
        {view.playerIds.map((id) => {
          const space = disp[id] ?? 0;
          const group = occupants[space] ?? [id];
          const idx = group.indexOf(id);
          const n = group.length;
          const p = spaceXY(space);
          let x: number;
          let y: number;
          if (space === 0) {
            // line up side by side in the Start lane
            const step = Math.min(11.5, 84 / n);
            x = 8 + idx * step;
            y = p.y - 1;
          } else {
            const spread = n > 1 ? 3.2 : 0;
            const angle = (idx / n) * Math.PI * 2;
            x = p.x + Math.cos(angle) * spread;
            y = p.y + Math.sin(angle) * spread - 1.5;
          }
          const player = byId[id];
          return (
            <div
              key={id}
              className={`cr-piece ${hopping.has(id) ? 'hop' : ''} ${flying.has(id) ? 'flying' : ''} ${id === myId ? 'me' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, zIndex: 10 + Math.round(y) }}
            >
              <img src={colorOf(player?.color ?? 0).avatar} alt={player?.name ?? ''} draggable={false} />
              {flying.has(id) && <span className="bonk">BONK!</span>}
            </div>
          );
        })}

        {anim && (stage === 'cards' || stage === 'flip') && (
          <div className="cr-reveal">
            <div className="cr-reveal-title">{stage === 'cards' ? 'Revealing…' : anim.clashed.length ? 'CLASH!' : 'Go!'}</div>
            <div className="cr-cards">
              {view.playerIds.map((id, i) => {
                const clashed = anim.clashed.includes(id);
                const player = byId[id];
                return (
                  <div key={id} className={`cr-card ${stage === 'flip' ? 'flipped' : ''} ${stage === 'flip' && clashed ? 'clashed' : ''}`} style={{ transitionDelay: `${i * 60}ms` }}>
                    <div className="cr-card-inner">
                      <div className="cr-card-face back" style={{ borderColor: colorOf(player?.color ?? 0).hex }}>
                        <img src={colorOf(player?.color ?? 0).avatar} alt="" />
                        <span>?</span>
                      </div>
                      <div className="cr-card-face front" style={{ background: colorOf(player?.color ?? 0).hex }}>
                        <span className="cr-card-num">{anim.picks[id]}</span>
                        <span className="cr-card-name">{player?.name}</span>
                        {anim.autoPicked.includes(id) && <span className="cr-card-auto">⏱ auto</span>}
                        {clashed && <span className="cr-stamp">CLASH</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {view.winners.length > 0 && stage === 'done' && (
          <div className="cr-winner pop-in">🏆 {winnerNames} {view.winners.length > 1 ? 'share the win!' : 'wins!'}</div>
        )}
      </div>

      <div className="cr-locks">
        {view.playerIds.map((id) => {
          const locked = view.lockedIn.includes(id);
          const p = byId[id];
          return (
            <span key={id} className={`cr-lock ${locked && picking ? 'on' : ''}`} style={{ borderColor: colorOf(p?.color ?? 0).hex }}>
              {picking ? (locked ? '🔒' : '🤔') : '•'} {p?.name}
            </span>
          );
        })}
      </div>

      <div className="cr-picker">
        {picking && view.myPick == null && <div className="cr-hint">Pick a number. Unique numbers move!</div>}
        {picking && view.myPick != null && <div className="cr-hint">Locked in <b>{view.myPick}</b>. Waiting for others…</div>}
        {!picking && <div className="cr-hint">&nbsp;</div>}
        <div className="cr-numbers" style={{ gridTemplateColumns: `repeat(${view.maxPick <= 6 ? view.maxPick : Math.ceil(view.maxPick / 2)}, 1fr)` }}>
          {Array.from({ length: view.maxPick }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              data-silent
              className={`cr-num ${view.myPick === n ? 'picked' : ''}`}
              disabled={!picking || view.myPick != null}
              onClick={() => {
                playSfx(sLockin);
                vibrate(30);
                sendAction({ type: 'pick', n });
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
