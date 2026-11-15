import { getGame } from '../games/registry';
import { PeerTransport } from './peerTransport';
import { HOST_ID, type Transport } from './transport';
import type { GameContext, GameDefinition, Player, RankEntry } from './types';
import { PALETTE } from './palette';

export type RoomPhase = 'lobby' | 'playing' | 'results';

export interface RoomSnapshot {
  code: string;
  gameId: string;
  players: Player[];
  phase: RoomPhase;
  results: RankEntry[] | null;
  /** Bumped on every new game so views can reset local animation state. */
  gameNumber: number;
}

export interface SessionState {
  status: 'connecting' | 'ready' | 'closed' | 'error';
  error?: string;
  isHost: boolean;
  myId: string | null;
  room: RoomSnapshot | null;
  view: unknown;
}

export interface Reaction { key: number; playerId: string; emoji: string }

export const REACTIONS = ['😂', '😱', '🔥', '👏', '😡', '💀'];

type ClientMsg =
  | { t: 'hello'; name: string; color: number }
  | { t: 'action'; action: unknown }
  | { t: 'reaction'; emoji: string }
  | { t: 'pong' };

type HostMsg =
  | { t: 'welcome'; you: string }
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'view'; view: unknown }
  | { t: 'reaction'; playerId: string; emoji: string }
  | { t: 'error'; message: string }
  | { t: 'ping' }
  | { t: 'closed' };

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const HEARTBEAT_MS = 2000;
const TIMEOUT_MS = 12000;
const BOT_NAMES = ['Bolt', 'Zippy', 'Nova', 'Turbo', 'Pixel', 'Rocket', 'Blip', 'Comet', 'Dash', 'Fizz'];

export function randomCode(random = Math.random) {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join('');
}

const ctx = (): GameContext => ({ now: Date.now(), random: Math.random });

/**
 * One room, seen from either the host or a client. React subscribes via `subscribe`.
 * The host holds the true game state; clients only ever receive their own player view.
 */
export class RoomSession {
  state: SessionState = { status: 'connecting', isHost: false, myId: null, room: null, view: null };
  private listeners = new Set<() => void>();
  private reactionListeners = new Set<(r: Reaction) => void>();
  private transport: Transport;
  private timers: ReturnType<typeof setInterval>[] = [];
  private reactionKey = 0;
  private lastSeen = new Map<string, number>();
  /** The 4-letter room code. */
  code = '';

  // host-only
  private game: GameDefinition | null = null;
  private gameState: unknown = null;
  private peerToPlayer = new Map<string, string>();
  private botTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  private constructor(transport: Transport) {
    this.transport = transport;
  }

  // ---------- lifecycle ----------

  static async host(gameId: string, me: { name: string; color: number }, transport?: () => Transport): Promise<RoomSession> {
    const game = getGame(gameId);
    if (!game) throw new Error('Unknown game');
    let lastErr: unknown;
    for (let i = 0; i < 6; i++) {
      const t = transport ? transport() : new PeerTransport();
      const s = new RoomSession(t);
      const code = randomCode();
      try {
        await t.createRoom(code);
        s.setupHost(game, code, me);
        return s;
      } catch (e) {
        t.destroy();
        lastErr = e;
        if ((e as Error).message !== 'code-taken') break;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('network');
  }

  static join(code: string, me: { name: string; color: number }, transport?: Transport): RoomSession {
    const t = transport ?? new PeerTransport();
    const s = new RoomSession(t);
    s.setupClient(code, me);
    return s;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  onReaction(fn: (r: Reaction) => void) {
    this.reactionListeners.add(fn);
    return () => { this.reactionListeners.delete(fn); };
  }
  getState = () => this.state;

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  leave() {
    if (this.state.isHost) this.broadcast({ t: 'closed' });
    this.cleanup();
    // give the 'closed' message a moment to flush before tearing down the connections
    setTimeout(() => this.transport.destroy(), 300);
  }

  private cleanup() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.botTimers.forEach(clearTimeout);
    this.botTimers.clear();
  }

  private close(reason: string) {
    if (this.state.status === 'closed') return;
    this.cleanup();
    this.transport.destroy();
    this.set({ status: 'closed', error: reason });
  }

  // ---------- shared actions (both roles) ----------

  sendAction = (action: unknown) => {
    if (this.state.isHost) this.applyPlayerAction(this.state.myId!, action);
    else this.transport.send(HOST_ID, { t: 'action', action } satisfies ClientMsg);
  };

  sendReaction(emoji: string) {
    if (!REACTIONS.includes(emoji)) return;
    if (this.state.isHost) this.relayReaction(this.state.myId!, emoji);
    else this.transport.send(HOST_ID, { t: 'reaction', emoji } satisfies ClientMsg);
  }

  private emitReaction(playerId: string, emoji: string) {
    const r = { key: ++this.reactionKey, playerId, emoji };
    this.reactionListeners.forEach((l) => l(r));
  }

  // ---------- client ----------

  private setupClient(code: string, me: { name: string; color: number }) {
    this.code = code;
    this.set({ status: 'connecting', isHost: false });
    this.transport.onMessage((_from, raw) => {
      this.lastSeen.set(HOST_ID, Date.now());
      const msg = raw as HostMsg;
      switch (msg.t) {
        case 'welcome': this.set({ myId: msg.you, status: 'ready' }); break;
        case 'room': this.set({ room: msg.room }); break;
        case 'view': this.set({ view: msg.view }); break;
        case 'reaction': this.emitReaction(msg.playerId, msg.emoji); break;
        case 'ping': this.transport.send(HOST_ID, { t: 'pong' } satisfies ClientMsg); break;
        case 'error': this.cleanup(); this.transport.destroy(); this.set({ status: 'error', error: msg.message }); break;
        case 'closed': this.close('Host left, room closed'); break;
      }
    });
    this.transport.onPeerLeave(() => this.close('Host left, room closed'));
    this.transport.joinRoom(code).then(
      () => {
        this.lastSeen.set(HOST_ID, Date.now());
        this.transport.send(HOST_ID, { t: 'hello', name: me.name, color: me.color } satisfies ClientMsg);
        this.timers.push(setInterval(() => {
          if (Date.now() - (this.lastSeen.get(HOST_ID) ?? 0) > TIMEOUT_MS) this.close('Host left, room closed');
        }, HEARTBEAT_MS));
      },
      (e: Error) => {
        this.transport.destroy();
        const message = e.message === 'room-not-found' ? `Room ${code} not found` : e.message === 'timeout' ? 'Could not reach the room. Check your connection.' : 'Connection failed. Check your internet connection.';
        this.set({ status: 'error', error: message });
      },
    );
  }

  // ---------- host ----------

  private setupHost(game: GameDefinition, code: string, me: { name: string; color: number }) {
    this.code = code;
    this.game = game;
    const host: Player = { id: 'p0', name: me.name, color: me.color, isBot: false, isHost: true, connected: true };
    this.set({
      status: 'ready', isHost: true, myId: host.id,
      room: { code, gameId: game.id, players: [host], phase: 'lobby', results: null, gameNumber: 0 },
    });
    this.transport.onMessage((peer, raw) => this.onClientMessage(peer, raw as ClientMsg));
    this.transport.onPeerLeave((peer) => this.onPeerGone(peer));
    this.timers.push(setInterval(() => this.heartbeat(), HEARTBEAT_MS));
    this.timers.push(setInterval(() => this.tick(), 250));
  }

  private get room() { return this.state.room!; }

  private send(peer: string, msg: HostMsg) { this.transport.send(peer, msg); }
  private broadcast(msg: HostMsg) { for (const peer of this.peerToPlayer.keys()) this.send(peer, msg); }

  private setRoom(patch: Partial<RoomSnapshot>) {
    this.set({ room: { ...this.room, ...patch } });
    this.broadcast({ t: 'room', room: this.room });
  }

  private onClientMessage(peer: string, msg: ClientMsg) {
    this.lastSeen.set(peer, Date.now());
    const playerId = this.peerToPlayer.get(peer);
    switch (msg.t) {
      case 'hello': this.onHello(peer, msg); break;
      case 'action': if (playerId) this.applyPlayerAction(playerId, msg.action); break;
      case 'reaction': if (playerId && REACTIONS.includes(msg.emoji)) this.relayReaction(playerId, msg.emoji); break;
    }
  }

  private reject(peer: string, message: string) {
    this.send(peer, { t: 'error', message });
    setTimeout(() => this.transport.kick?.(peer), 500);
  }

  private onHello(peer: string, msg: { name: string; color: number }) {
    if (this.peerToPlayer.has(peer)) return;
    const name = String(msg.name || 'Player').trim().slice(0, 16) || 'Player';
    const players = [...this.room.players];
    let player: Player | undefined;

    // Rejoin: a dropped human with the same name gets their seat back from the bot.
    const dropped = players.find((p) => !p.connected && p.name.toLowerCase() === name.toLowerCase());
    if (dropped) {
      player = { ...dropped, connected: true, isBot: false };
      players[players.indexOf(dropped)] = player;
      this.clearBot(player.id);
    } else if (this.room.phase !== 'lobby') {
      return this.reject(peer, 'That game has already started');
    } else if (players.length >= this.game!.maxPlayers) {
      return this.reject(peer, 'That room is full');
    } else {
      player = {
        id: `p${this.nextId++}`, name: uniqueName(name, players), color: freeColor(msg.color, players),
        isBot: false, isHost: false, connected: true,
      };
      players.push(player);
    }
    this.peerToPlayer.set(peer, player.id);
    this.send(peer, { t: 'welcome', you: player.id });
    this.setRoom({ players });
    this.pushViews();
  }

  private onPeerGone(peer: string) {
    const id = this.peerToPlayer.get(peer);
    this.peerToPlayer.delete(peer);
    this.lastSeen.delete(peer);
    if (!id) return;
    if (this.room.phase === 'lobby') {
      this.setRoom({ players: this.room.players.filter((p) => p.id !== id) });
    } else {
      // Mid-game: a bot takes over the seat until the player rejoins with the same name.
      this.setRoom({ players: this.room.players.map((p) => (p.id === id ? { ...p, connected: false, isBot: true } : p)) });
      this.scheduleBots();
    }
  }

  private heartbeat() {
    const now = Date.now();
    for (const peer of [...this.peerToPlayer.keys()]) {
      if (now - (this.lastSeen.get(peer) ?? now) > TIMEOUT_MS) {
        this.transport.kick?.(peer);
        this.onPeerGone(peer);
      } else {
        this.send(peer, { t: 'ping' });
      }
    }
  }

  private relayReaction(playerId: string, emoji: string) {
    this.broadcast({ t: 'reaction', playerId, emoji });
    this.emitReaction(playerId, emoji);
  }

  // host-only lobby controls
  addBot() {
    if (!this.state.isHost || this.room.phase !== 'lobby') return;
    const players = this.room.players;
    if (players.length >= this.game!.maxPlayers) return;
    const used = new Set(players.map((p) => p.name));
    const base = BOT_NAMES.find((n) => !used.has(`${n} 🤖`)) ?? `Bot ${players.length}`;
    const bot: Player = {
      id: `b${this.nextId++}`, name: `${base} 🤖`, color: freeColor(Math.floor(Math.random() * PALETTE.length), players),
      isBot: true, isHost: false, connected: true,
    };
    this.setRoom({ players: [...players, bot] });
  }

  removeBot(id: string) {
    if (!this.state.isHost || this.room.phase !== 'lobby') return;
    this.setRoom({ players: this.room.players.filter((p) => !(p.id === id && p.isBot)) });
  }

  canStart() {
    const n = this.room.players.length;
    return this.state.isHost && n >= this.game!.minPlayers && n <= this.game!.maxPlayers;
  }

  start() {
    if (!this.canStart() && this.room.phase === 'lobby') return;
    if (!this.state.isHost) return;
    this.gameState = this.game!.createInitialState(this.room.players, ctx());
    this.setRoom({ phase: 'playing', results: null, gameNumber: this.room.gameNumber + 1 });
    this.afterStateChange();
  }

  /** Rematch: same room, same seats (dropped players stay bot-controlled until they rejoin). */
  rematch() { this.start(); }

  private applyPlayerAction(playerId: string, action: unknown) {
    if (this.room.phase !== 'playing' || !this.game) return;
    const next = this.game.applyAction(this.gameState, action, playerId, ctx());
    if (next !== this.gameState) {
      this.gameState = next;
      this.afterStateChange();
    }
  }

  private tick() {
    if (this.room.phase !== 'playing' || !this.game?.tick) return;
    const next = this.game.tick(this.gameState, ctx());
    if (next !== this.gameState) {
      this.gameState = next;
      this.afterStateChange();
    }
  }

  private afterStateChange() {
    const results = this.game!.getResults?.(this.gameState) ?? null;
    if (results) {
      this.botTimers.forEach(clearTimeout);
      this.botTimers.clear();
      this.setRoom({ phase: 'results', results });
    }
    this.pushViews();
    if (!results) this.scheduleBots();
  }

  private pushViews() {
    if (this.gameState == null || !this.game) return;
    for (const [peer, id] of this.peerToPlayer) this.send(peer, { t: 'view', view: this.game.getPlayerView(this.gameState, id) });
    this.set({ view: this.game.getPlayerView(this.gameState, this.state.myId!) });
  }

  private clearBot(id: string) {
    const t = this.botTimers.get(id);
    if (t) clearTimeout(t);
    this.botTimers.delete(id);
  }

  /** Each bot seat gets a short "thinking" delay, then asks the game what to do. */
  private scheduleBots() {
    if (this.room.phase !== 'playing') return;
    for (const p of this.room.players) {
      if (!p.isBot || this.botTimers.has(p.id)) continue;
      const delay = 600 + Math.random() * 2400;
      this.botTimers.set(p.id, setTimeout(() => {
        this.botTimers.delete(p.id);
        const seat = this.room.players.find((x) => x.id === p.id);
        if (!seat?.isBot || this.room.phase !== 'playing') return;
        const action = this.game!.botAction(this.gameState, p.id, ctx());
        if (action != null) this.applyPlayerAction(p.id, action);
      }, delay));
    }
  }
}

function uniqueName(name: string, players: Player[]) {
  const taken = new Set(players.map((p) => p.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
}

function freeColor(wanted: number, players: Player[]) {
  const used = new Set(players.map((p) => p.color));
  if (!used.has(wanted) && wanted >= 0 && wanted < PALETTE.length) return wanted;
  for (let i = 0; i < PALETTE.length; i++) if (!used.has(i)) return i;
  return wanted % PALETTE.length;
}
