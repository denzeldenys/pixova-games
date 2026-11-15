import { lazy } from 'react';
import type { GameDefinition } from '../../core/types';
import * as rules from './rules';
import type { ClashAction, ClashState, ClashView } from './rules';
import cover from './assets/cover.webp';
import music from './assets/music.mp3?url';
import win from './assets/win.mp3?url';
import lose from './assets/lose.mp3?url';

const clashRace: GameDefinition<ClashState, ClashAction, ClashView> = {
  id: 'clash-race',
  name: 'Clash Race',
  description: 'Pick a secret number. Match someone and you both stall!',
  icon: '🏁',
  cover,
  minPlayers: 2,
  maxPlayers: 8,
  createInitialState: rules.createInitialState,
  applyAction: rules.applyAction,
  getPlayerView: rules.getPlayerView,
  botAction: rules.botAction,
  tick: rules.tick,
  getResults: rules.getResults,
  // The view (and its images/sounds) is code-split and only loaded when the game starts.
  Component: lazy(() => import('./ClashRaceView')),
  music,
  resultSounds: { win, lose },
};

export default clashRace;
