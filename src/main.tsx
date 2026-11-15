import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAudioUnlock } from './core/audio';
import { initInstallPrompt } from './components/InstallButton';
import './styles.css';

initAudioUnlock();
initInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
