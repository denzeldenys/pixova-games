import { useEffect, useState } from 'react';
import { colorOf } from '../core/palette';
import type { Player } from '../core/types';
import type { Reaction, RoomSession } from '../core/room';

/** Active floating reactions per player id. */
export function useReactions(session: RoomSession) {
  const [active, setActive] = useState<Reaction[]>([]);
  useEffect(() => session.onReaction((r) => {
    setActive((a) => [...a.slice(-12), r]);
    setTimeout(() => setActive((a) => a.filter((x) => x.key !== r.key)), 2200);
  }), [session]);
  return active;
}

export default function Avatar({ player, size = 48, reactions = [], dim = false }: {
  player: Player;
  size?: number;
  reactions?: Reaction[];
  dim?: boolean;
}) {
  const c = colorOf(player.color);
  return (
    <span className={`avatar ${dim ? 'dim' : ''}`} style={{ width: size, height: size }}>
      <img src={c.avatar} alt="" width={size} height={size} draggable={false} />
      {!player.connected && <span className="avatar-badge" title="Disconnected: a bot is playing">📡</span>}
      {reactions.filter((r) => r.playerId === player.id).map((r, i) => (
        <span key={r.key} className="float-emoji" style={{ left: `${30 + ((r.key * 37) % 40)}%`, animationDelay: `${i * 0.02}s` }}>{r.emoji}</span>
      ))}
    </span>
  );
}
