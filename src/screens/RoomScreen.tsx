import { Suspense, useEffect, useState } from 'react';
import type { RoomSession } from '../core/room';
import { useSession } from '../core/hooks';
import { getGame } from '../games/registry';
import { playSfx } from '../core/audio';
import Avatar, { useReactions } from '../components/Avatar';
import ReactionBar from '../components/ReactionBar';
import AudioToggles from '../components/AudioToggles';

export default function RoomScreen({ session, onLeave }: { session: RoomSession; onLeave: () => void }) {
  const st = useSession(session);
  const reactions = useReactions(session);
  const room = st.room;
  const game = room ? getGame(room.gameId) : undefined;

  if (st.status === 'connecting' || !room || !st.myId) {
    return (
      <div className="screen center-screen">
        <div className="spinner" />
        <p>Joining room <b>{session.code}</b>…</p>
        <button className="btn btn-ghost" onClick={onLeave}>Cancel</button>
      </div>
    );
  }
  if (!game) {
    return (
      <div className="screen center-screen">
        <p>This room is playing a game your app doesn't have yet. Try refreshing to update.</p>
        <button className="btn btn-primary" onClick={onLeave}>Back to games</button>
      </div>
    );
  }

  const top = (
    <header className="room-header">
      <button className="icon-btn" onClick={onLeave} aria-label="Leave room">←</button>
      <div className="room-title">{game.icon} {game.name}<span className="room-code-chip">{room.code}</span></div>
      <AudioToggles />
    </header>
  );

  if (room.phase === 'lobby') {
    return <div className="screen">{top}<Lobby session={session} reactions={reactions} /></div>;
  }

  if (room.phase === 'results') {
    return <div className="screen">{top}<Results session={session} reactions={reactions} onLeave={onLeave} /></div>;
  }

  const Game = game.Component;
  return (
    <div className="screen game-screen">
      {top}
      <div className="player-bar">
        {room.players.map((p) => (
          <div key={p.id} className={`player-bar-item ${p.id === st.myId ? 'me' : ''}`}>
            <Avatar player={p} size={40} reactions={reactions} />
            <span className="player-bar-name">{p.name}</span>
          </div>
        ))}
      </div>
      <div className="game-area">
        <Suspense fallback={<div className="center-screen"><div className="spinner" /></div>}>
          {st.view != null ? (
            <Game key={room.gameNumber} view={st.view} sendAction={session.sendAction} myId={st.myId} players={room.players} />
          ) : (
            <div className="center-screen"><div className="spinner" /></div>
          )}
        </Suspense>
      </div>
      <ReactionBar session={session} />
    </div>
  );
}

function Lobby({ session, reactions }: { session: RoomSession; reactions: ReturnType<typeof useReactions> }) {
  const st = useSession(session);
  const room = st.room!;
  const game = getGame(room.gameId)!;
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${location.pathname}#/room/${room.code}`;
  const full = room.players.length >= game.maxPlayers;
  const need = game.minPlayers - room.players.length;

  const share = async () => {
    const text = `Join my ${game.name} game on Pixova Games! Room code ${room.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Pixova Games', text, url: link });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this invite link', link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lobby">
      <div className="code-card">
        <div className="muted small">Room code</div>
        <div className="room-code">{room.code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        <button className="btn btn-secondary btn-block" onClick={share}>{copied ? '✓ Link copied!' : '📨 Share invite link'}</button>
      </div>

      <h2 className="section-title">Players <span className="muted">{room.players.length}/{game.maxPlayers}</span></h2>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.id} className={`player-row pop-in ${p.id === st.myId ? 'me' : ''}`}>
            <Avatar player={p} size={44} reactions={reactions} />
            <span className="player-name">{p.name}{p.id === st.myId && <span className="muted"> (you)</span>}</span>
            {p.isHost && <span className="tag tag-host">👑 Host</span>}
            {p.isBot && <span className="tag">Bot</span>}
            {st.isHost && p.isBot && (
              <button className="icon-btn small" onClick={() => session.removeBot(p.id)} aria-label={`Remove ${p.name}`}>✕</button>
            )}
          </li>
        ))}
      </ul>

      {st.isHost ? (
        <div className="lobby-actions">
          <button className="btn btn-secondary btn-block" disabled={full} onClick={() => session.addBot()}>🤖 Add bot</button>
          <button className="btn btn-primary btn-block btn-big" disabled={!session.canStart()} onClick={() => session.start()}>
            {need > 0 ? `Need ${need} more player${need > 1 ? 's' : ''}` : 'Start game ▶'}
          </button>
        </div>
      ) : (
        <p className="waiting">Waiting for the host to start<span className="dots" /></p>
      )}
      <ReactionBar session={session} />
    </div>
  );
}

function Results({ session, reactions, onLeave }: {
  session: RoomSession; reactions: ReturnType<typeof useReactions>; onLeave: () => void;
}) {
  const st = useSession(session);
  const room = st.room!;
  const game = getGame(room.gameId)!;
  const results = room.results ?? [];
  const mine = results.find((r) => r.playerId === st.myId);
  const won = mine?.rank === 1;

  useEffect(() => {
    const s = won ? game.resultSounds?.win : game.resultSounds?.lose;
    if (s) playSfx(s, 0.9);
  }, [won, game, room.gameNumber]);

  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`);
  const winners = results.filter((r) => r.rank === 1).map((r) => room.players.find((p) => p.id === r.playerId)?.name).filter(Boolean);

  return (
    <div className="results">
      <div className={`results-banner ${won ? 'won' : ''}`}>
        <div className="results-emoji">{won ? '🏆' : '🎉'}</div>
        <h2>{won ? (winners.length > 1 ? 'You shared the win!' : 'You win!') : `${winners.join(' & ')} win${winners.length > 1 ? '' : 's'}!`}</h2>
      </div>
      <ol className="ranking">
        {results.map((r, i) => {
          const p = room.players.find((x) => x.id === r.playerId);
          if (!p) return null;
          return (
            <li key={r.playerId} className={`rank-row pop-in rank-${r.rank} ${p.id === st.myId ? 'me' : ''}`} style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="medal">{medal(r.rank)}</span>
              <Avatar player={p} size={44} reactions={reactions} />
              <span className="player-name">{p.name}</span>
              {r.detail && <span className="muted small">{r.detail}</span>}
            </li>
          );
        })}
      </ol>
      <div className="lobby-actions">
        {st.isHost ? (
          <button className="btn btn-primary btn-block btn-big" onClick={() => session.rematch()}>🔁 Rematch</button>
        ) : (
          <p className="waiting">Waiting for the host to start a rematch<span className="dots" /></p>
        )}
        <button className="btn btn-ghost btn-block" onClick={onLeave}>Back to games</button>
      </div>
      <ReactionBar session={session} />
    </div>
  );
}
