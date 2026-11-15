# Pixova Games

Mobile-first multiplayer party games that run entirely in the browser. No signup, no server: one
player hosts a room in their own browser and friends join with a 4-letter code or an invite link.

**Play:** https://denzeldenys.github.io/pixova-games/

Built with Vite, React and TypeScript, using plain CSS. Realtime play goes over WebRTC through
[PeerJS](https://peerjs.com/) (free public broker), and the app installs as a PWA with offline support.

## Games

| Game | Players | Idea |
| --- | --- | --- |
| 🏁 Clash Race | 2–8 | Everyone secretly picks a number. Unique numbers move; matching numbers clash and stall. Land on someone to knock them back to their last checkpoint. First to space 30 wins. |

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/pixova-games/
npm test           # game rule unit tests (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker included)
```

Pushing to `main` builds, tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Architecture

```
src/
  core/            shared platform; no game-specific code
    types.ts         GameDefinition, Player, GameContext, RankEntry
    transport.ts     Transport interface (createRoom, joinRoom, send, onMessage, onPeerLeave)
    peerTransport.ts PeerJS implementation of Transport
    room.ts          RoomSession: host-authoritative rooms, lobby, bots, reconnects, reactions
    audio.ts         lazy SFX (Web Audio) and music, with separate remembered mute toggles
    fx.ts            screen shake and vibration helpers for games
  screens/         Home, RoomScreen (lobby / game / results)
  components/      avatars, reactions, install button, name dialog, audio toggles
  games/
    registry.ts      the list of games
    clash-race/      one self-contained game: rules, view, styles, assets
```

**Networking model.** The room creator's browser is the host. It holds the true game state, runs
`applyAction` for every action, and sends each player only `getPlayerView(state, playerId)`, so
secret information never leaves the host. Room code `ABCD` maps to PeerJS id `pixova-ABCD`.
Everything goes through the `Transport` interface, so PeerJS can be replaced with Firebase or a
WebSocket server by writing one new class.

**Disconnects.** A heartbeat runs every 2 s. If a player drops mid-game, a bot takes over their seat.
They get it back by rejoining the same room with the same name. If the host leaves, everyone sees
"Host left, room closed" and returns home.

## How to add a game

1. Create a folder `src/games/<game-id>/` and put everything for the game in it: rules, view
   component, CSS and assets (`src/games/<game-id>/assets/`).
2. Export a default `GameDefinition` from `src/games/<game-id>/index.ts`:

   ```ts
   import { lazy } from 'react';
   import type { GameDefinition } from '../../core/types';

   const myGame: GameDefinition<MyState, MyAction, MyView> = {
     id: 'my-game',
     name: 'My Game',
     description: 'One line that sells it.',
     icon: '🎲',                     // emoji or image URL
     cover: coverUrl,                 // optional card art (import './assets/cover.webp')
     minPlayers: 2,
     maxPlayers: 6,
     createInitialState(players, ctx) { /* ... */ },
     applyAction(state, action, playerId, ctx) { /* pure: return new state, or the same state to ignore */ },
     getPlayerView(state, playerId) { /* strip anything this player must not see */ },
     botAction(state, botId, ctx) { /* an action, or null if the bot has nothing to do now */ },
     Component: lazy(() => import('./MyGameView')), // receives { view, sendAction, myId, players }
     // optional:
     tick(state, ctx) { /* timers; called by the host about every 250 ms */ },
     getResults(state) { /* RankEntry[] once the game is over, else null */ },
     music: musicUrl,
     resultSounds: { win: winUrl, lose: loseUrl },
   };
   export default myGame;
   ```

3. Add one line to `src/games/registry.ts`:

   ```ts
   import myGame from './my-game';
   export const GAMES = [clashRace, myGame];
   ```

That's all. The home card, rooms, lobby, invite links, bots, reconnects, emoji reactions, the
results screen and rematch come from the shared shell.

Tips:
- Keep the rules pure. Use `ctx.now` and `ctx.random` instead of `Date.now()` and `Math.random()`
  so the rules are easy to unit test (see `src/games/clash-race/rules.test.ts`).
- Use `playSfx` and `setMusic` from `core/audio` and `shake` and `vibrate` from `core/fx` for juice.
  They respect the player's mute settings and autoplay rules.
- Player colours and avatar art come from `core/palette` (8 colours).

## Assets

The logo, PWA icons, game cover, track background, the 8 player avatars, the sound effects and both
music loops were generated with Magnific. The original downloads are kept in `asset-src/raw/`.
`node scripts/process-assets.mjs` turns them into the optimised WebP images, icons and MP3s used by
the app. Shared assets live in `src/assets/`; game assets live in their game folder.
