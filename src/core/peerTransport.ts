import Peer, { type DataConnection } from 'peerjs';
import { HOST_ID, type Transport } from './transport';

const PREFIX = 'pixova-';

/** Transport over WebRTC data channels, brokered by the free PeerJS cloud server. */
export class PeerTransport implements Transport {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private msgCbs: ((from: string, msg: unknown) => void)[] = [];
  private leaveCbs: ((id: string) => void)[] = [];
  private destroyed = false;

  createRoom(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(PREFIX + code, { debug: 1 });
      this.peer = peer;
      let opened = false;
      peer.on('open', () => { opened = true; resolve(); });
      peer.on('connection', (conn) => {
        conn.on('open', () => this.conns.set(conn.peer, conn));
        conn.on('data', (data) => this.msgCbs.forEach((cb) => cb(conn.peer, data)));
        const gone = () => {
          if (this.conns.get(conn.peer) === conn) {
            this.conns.delete(conn.peer);
            this.leaveCbs.forEach((cb) => cb(conn.peer));
          }
        };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      peer.on('disconnected', () => {
        // Lost the broker (not the players). Try to stay reachable for rejoins.
        if (!this.destroyed) setTimeout(() => !this.destroyed && peer.reconnect(), 1000);
      });
      peer.on('error', (err: any) => {
        if (!opened) reject(new Error(err?.type === 'unavailable-id' ? 'code-taken' : err?.type || 'network'));
      });
    });
  }

  joinRoom(code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1 });
      this.peer = peer;
      let connected = false;
      const timer = setTimeout(() => { if (!connected) reject(new Error('timeout')); }, 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => { connected = true; clearTimeout(timer); resolve(); });
        conn.on('data', (data) => this.msgCbs.forEach((cb) => cb(HOST_ID, data)));
        const gone = () => { if (connected && !this.destroyed) this.leaveCbs.forEach((cb) => cb(HOST_ID)); };
        conn.on('close', gone);
        conn.on('error', gone);
      });
      peer.on('error', (err: any) => {
        if (!connected) {
          clearTimeout(timer);
          reject(new Error(err?.type === 'peer-unavailable' ? 'room-not-found' : err?.type || 'network'));
        }
      });
    });
  }

  send(to: string, msg: unknown) {
    const conn = this.hostConn ?? this.conns.get(to);
    if (conn?.open) {
      try { conn.send(msg); } catch { /* channel closing */ }
    }
  }

  onMessage(cb: (from: string, msg: unknown) => void) { this.msgCbs.push(cb); }
  onPeerLeave(cb: (id: string) => void) { this.leaveCbs.push(cb); }

  kick(peerId: string) {
    const c = this.conns.get(peerId);
    this.conns.delete(peerId);
    c?.close();
  }

  destroy() {
    this.destroyed = true;
    this.msgCbs = [];
    this.leaveCbs = [];
    this.conns.forEach((c) => c.close());
    this.hostConn?.close();
    this.peer?.destroy();
  }
}
