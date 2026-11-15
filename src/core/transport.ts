/**
 * Minimal networking contract. The room logic only talks to this interface, so PeerJS can be
 * replaced by Firebase, a WebSocket server, etc. without touching games or the lobby.
 *
 * Topology is a star: the host is reachable by room code and every client connects to the host.
 * Peer ids are opaque strings chosen by the transport.
 */
export interface Transport {
  /** Become the host for `code`. Rejects with Error('code-taken') if the code is in use. */
  createRoom(code: string): Promise<void>;
  /** Connect to the host of `code`. Rejects with Error('room-not-found') if nobody hosts it. */
  joinRoom(code: string): Promise<void>;
  /** Host: send to one client id. Client: `to` is ignored and the message goes to the host. */
  send(to: string, msg: unknown): void;
  onMessage(cb: (from: string, msg: unknown) => void): void;
  /** Host: a client connection closed. Client: called with 'host' when the host is gone. */
  onPeerLeave(cb: (peerId: string) => void): void;
  /** Drop a single client (host only). */
  kick?(peerId: string): void;
  destroy(): void;
}

export const HOST_ID = 'host';
