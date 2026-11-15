import { setMusicMuted, setSfxMuted } from '../core/audio';
import { useAudioPrefs } from '../core/hooks';

export default function AudioToggles() {
  const { sfxMuted, musicMuted } = useAudioPrefs();
  return (
    <div className="audio-toggles">
      <button
        className={`icon-btn ${musicMuted ? 'off' : ''}`}
        onClick={() => setMusicMuted(!musicMuted)}
        aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
        title={musicMuted ? 'Music off' : 'Music on'}
      >
        🎵
        {musicMuted && <span className="slash" />}
      </button>
      <button
        className={`icon-btn ${sfxMuted ? 'off' : ''}`}
        onClick={() => setSfxMuted(!sfxMuted)}
        aria-label={sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        title={sfxMuted ? 'Sound effects off' : 'Sound effects on'}
      >
        {sfxMuted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
