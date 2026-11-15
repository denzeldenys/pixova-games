import { REACTIONS, type RoomSession } from '../core/room';

export default function ReactionBar({ session }: { session: RoomSession }) {
  return (
    <div className="reaction-bar" aria-label="Send a reaction">
      {REACTIONS.map((e) => (
        <button key={e} data-silent className="reaction-btn" onClick={() => session.sendReaction(e)} aria-label={`React ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}
