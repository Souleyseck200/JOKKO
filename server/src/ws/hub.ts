// server/src/ws/hub.ts
import type { WebSocket } from 'ws';
import crypto from 'node:crypto';
import type { UUID, ServerEnvelope } from '@lan-comm/shared';
import { WS_CLOSE } from '@lan-comm/shared';

export interface WsConnection {
  connId: string;
  userId: UUID;
  socket: WebSocket;
  authenticatedAt: string;
}

class WsHub {
  private connections = new Map<UUID, WsConnection>();

  register(userId: UUID, socket: WebSocket): WsConnection {
    // Si l'utilisateur a déjà une connexion active, fermer l'ancienne
    const existing = this.connections.get(userId);
    if (existing && existing.socket !== socket) {
      try {
        existing.socket.close(WS_CLOSE.REPLACED, 'Replaced by new connection');
      } catch {}
    }

    const conn: WsConnection = {
      connId: crypto.randomUUID(),
      userId,
      socket,
      authenticatedAt: new Date().toISOString(),
    };

    this.connections.set(userId, conn);
    return conn;
  }

  unregister(userId: UUID, socket: WebSocket): boolean {
    const existing = this.connections.get(userId);
    if (existing && existing.socket === socket) {
      this.connections.delete(userId);
      return true;
    }
    return false;
  }

  getConnection(userId: UUID): WsConnection | undefined {
    return this.connections.get(userId);
  }

  isUserConnected(userId: UUID): boolean {
    const conn = this.connections.get(userId);
    return Boolean(conn && conn.socket.readyState === 1); // 1 = OPEN
  }

  send(userId: UUID, envelope: ServerEnvelope): boolean {
    const conn = this.connections.get(userId);
    if (conn && conn.socket.readyState === 1) {
      conn.socket.send(JSON.stringify(envelope));
      return true;
    }
    return false;
  }

  broadcast(envelope: ServerEnvelope): void {
    const data = JSON.stringify(envelope);
    for (const conn of this.connections.values()) {
      if (conn.socket.readyState === 1) {
        conn.socket.send(data);
      }
    }
  }

  broadcastExcept(exceptUserId: UUID, envelope: ServerEnvelope): void {
    const data = JSON.stringify(envelope);
    for (const [uid, conn] of this.connections.entries()) {
      if (uid !== exceptUserId && conn.socket.readyState === 1) {
        conn.socket.send(data);
      }
    }
  }

  broadcastToUsers(userIds: UUID[], envelope: ServerEnvelope): void {
    const data = JSON.stringify(envelope);
    for (const uid of userIds) {
      const conn = this.connections.get(uid);
      if (conn && conn.socket.readyState === 1) {
        conn.socket.send(data);
      }
    }
  }

  getActiveCount(): number {
    return this.connections.size;
  }
}

export const wsHub = new WsHub();
