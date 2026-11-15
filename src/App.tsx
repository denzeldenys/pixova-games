import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomSession } from './core/room';
import { loadProfile, saveProfile, type Profile } from './core/profile';
import { navigate, useHashRoute } from './core/hooks';
import { playSfx, setMusic } from './core/audio';
import { getGame } from './games/registry';
import Home from './screens/Home';
import RoomScreen from './screens/RoomScreen';
import NameDialog from './components/NameDialog';
import tapSfx from './assets/audio/tap.mp3?url';
import lobbyMusic from './assets/audio/lobby.mp3?url';

const parseRoomCode = (route: string) => /^room\/([A-Za-z]{4})$/.exec(route)?.[1]?.toUpperCase() ?? null;

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const route = useHashRoute();
  const roomCode = parseRoomCode(route);
  const sessionRef = useRef<RoomSession | null>(null);
  sessionRef.current = session;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  // Follow the URL: an invite link (#/room/ABCD) joins that room; any other route leaves it.
  useEffect(() => {
    if (!profile || busy) return;
    // read the live hash: the route state can lag one render behind a navigate()
    const code = parseRoomCode(window.location.hash.replace(/^#\/?/, ''));
    const current = sessionRef.current;
    if (code) {
      if (current && current.code === code) return;
      current?.leave();
      const s = RoomSession.join(code, profile);
      sessionRef.current = s;
      setSession(s);
    } else if (current) {
      current.leave();
      sessionRef.current = null;
      setSession(null);
    }
  }, [roomCode, profile, busy]);

  // Room closed / join failed -> back home with a message.
  useEffect(() => {
    if (!session) return;
    return session.subscribe(() => {
      const st = session.state;
      if (st.status === 'closed' || st.status === 'error') {
        showToast(st.error || 'Disconnected');
        sessionRef.current = null;
        setSession(null);
        navigate('');
      }
    });
  }, [session, showToast]);

  // Music: game track while playing, lobby track elsewhere.
  const [phase, setPhase] = useState<string | null>(null);
  useEffect(() => {
    if (!session) { setPhase(null); return; }
    const sync = () => setPhase(session.state.room?.phase ?? null);
    sync();
    return session.subscribe(sync);
  }, [session]);
  useEffect(() => {
    const game = session?.state.room ? getGame(session.state.room.gameId) : null;
    setMusic(phase === 'playing' && game?.music ? game.music : lobbyMusic);
  }, [phase, session]);

  // Button tap sound for every button that does not opt out.
  useEffect(() => {
    const on = (e: Event) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && !b.disabled && !b.hasAttribute('data-silent')) playSfx(tapSfx, 0.45);
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, []);

  const createRoom = async (gameId: string) => {
    if (!profile) return;
    setBusy(true);
    try {
      const s = await RoomSession.host(gameId, profile);
      sessionRef.current = s;
      setSession(s);
      navigate(`room/${s.code}`);
    } catch {
      showToast('Could not create a room. Check your internet connection.');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => navigate('');

  return (
    <div id="app-shell" className="app-shell">
      {!profile || editingProfile ? (
        <NameDialog
          initial={profile}
          onSave={(name, color) => {
            setProfile(saveProfile(name, color));
            setEditingProfile(false);
          }}
          onCancel={profile ? () => setEditingProfile(false) : undefined}
        />
      ) : null}
      {profile && session && roomCode ? (
        <RoomScreen session={session} onLeave={leave} />
      ) : (
        <Home
          profile={profile}
          busy={busy}
          onEditProfile={() => setEditingProfile(true)}
          onCreate={createRoom}
          onJoin={(code) => navigate(`room/${code.toUpperCase()}`)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
