import { useRef, useState } from 'react';
import { GAMES } from '../games/registry';
import type { GameDefinition } from '../core/types';
import type { Profile } from '../core/profile';
import { colorOf } from '../core/palette';
import { useOnline } from '../core/hooks';
import InstallButton from '../components/InstallButton';
import AudioToggles from '../components/AudioToggles';
import logo from '../assets/logo.webp';

export default function Home({ profile, busy, onEditProfile, onCreate, onJoin }: {
  profile: Profile | null;
  busy: boolean;
  onEditProfile: () => void;
  onCreate: (gameId: string) => void;
  onJoin: (code: string) => void;
}) {
  const [selected, setSelected] = useState<GameDefinition | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const downOnBackdrop = useRef(false);
  const online = useOnline();
  const codeOk = /^[A-Za-z]{4}$/.test(joinCode);

  return (
    <div className="screen home">
      <header className="home-header">
        <div className="brand">
          <img src={logo} alt="" className="brand-logo" width={56} height={56} />
          <h1>Pixova<span>Games</span></h1>
        </div>
        <AudioToggles />
      </header>

      <div className="home-row">
        {profile && (
          <button className="profile-chip" onClick={onEditProfile} aria-label="Edit profile">
            <img src={colorOf(profile.color).avatar} alt="" width={36} height={36} />
            <span>{profile.name}</span>
            <span className="edit">✎</span>
          </button>
        )}
        <InstallButton />
      </div>

      {!online && (
        <div className="offline-banner" role="alert">
          📡 You're offline. Games need an internet connection to create or join a room.
        </div>
      )}

      <h2 className="section-title">Pick a game</h2>
      <div className="game-grid">
        {GAMES.map((g) => (
          <button key={g.id} className="game-card" onClick={() => { setSelected(g); setJoining(false); setJoinCode(''); }}>
            {g.cover ? <img className="game-cover" src={g.cover} alt="" loading="lazy" /> : <div className="game-cover emoji">{g.icon}</div>}
            <div className="game-info">
              <div className="game-name"><span className="game-icon">{g.icon}</span> {g.name}</div>
              <div className="game-desc">{g.description}</div>
              <div className="game-players">👥 {g.minPlayers}–{g.maxPlayers} players</div>
            </div>
          </button>
        ))}
        <div className="game-card coming-soon" aria-hidden>
          <div className="game-cover emoji">✨</div>
          <div className="game-info">
            <div className="game-name">More games soon</div>
            <div className="game-desc">New party games are on the way.</div>
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="sheet-backdrop"
          // close only when the press both starts and ends on the backdrop (ignores ghost clicks from the opening tap)
          onPointerDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
          onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) setSelected(null); downOnBackdrop.current = false; }}
        >
          <div className="sheet" role="dialog" aria-label={selected.name}>
            <div className="sheet-handle" />
            <h2>{selected.icon} {selected.name}</h2>
            <p className="muted">{selected.description}</p>
            {!joining ? (
              <>
                <button className="btn btn-primary btn-block" disabled={!online || busy} onClick={() => onCreate(selected.id)}>
                  {busy ? 'Creating room…' : 'Create room'}
                </button>
                <button className="btn btn-secondary btn-block" disabled={!online} onClick={() => setJoining(true)}>
                  Join with code
                </button>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (codeOk) onJoin(joinCode); }}>
                <input
                  className="input code-input"
                  autoFocus
                  maxLength={4}
                  placeholder="ABCD"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
                  aria-label="Room code"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button className="btn btn-primary btn-block" disabled={!codeOk || !online}>Join room</button>
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setJoining(false)}>Back</button>
              </form>
            )}
            {!online && <p className="muted center">Connect to the internet to play.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
