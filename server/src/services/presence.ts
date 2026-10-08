// server/src/services/presence.ts
import type { UUID, ISODate } from '@lan-comm/shared';
import { getDb } from '../db';
import { queries } from '../db/queries';

interface PresenceRecord {
  online: boolean;
  connCount: number;
  since: ISODate;
}

class PresenceService {
  private presence = new Map<UUID, PresenceRecord>();

  userConnected(userId: UUID): { changed: boolean; online: boolean } {
    const existing = this.presence.get(userId);
    const now = new Date().toISOString();

    if (!existing || existing.connCount <= 0) {
      this.presence.set(userId, { online: true, connCount: 1, since: now });
      return { changed: true, online: true };
    } else {
      existing.connCount += 1;
      return { changed: false, online: true };
    }
  }

  userDisconnected(userId: UUID): { changed: boolean; online: boolean; lastSeenAt?: ISODate } {
    const existing = this.presence.get(userId);
    if (!existing) return { changed: false, online: false };

    existing.connCount = Math.max(0, existing.connCount - 1);
    if (existing.connCount === 0) {
      existing.online = false;
      const now = new Date().toISOString();
      existing.since = now;

      // Mettre à jour lastSeenAt en base de données
      const db = getDb();
      queries.updateLastSeen(db, userId);

      return { changed: true, online: false, lastSeenAt: now };
    }

    return { changed: false, online: true };
  }

  isOnline(userId: UUID): boolean {
    const record = this.presence.get(userId);
    return Boolean(record?.online && record.connCount > 0);
  }

  getSnapshot(): Array<{ userId: UUID; online: boolean; lastSeenAt: ISODate | null }> {
    const db = getDb();
    const users = queries.getAllUsers(db);

    return users.map((u) => ({
      userId: u.id,
      online: this.isOnline(u.id),
      lastSeenAt: u.lastSeenAt,
    }));
  }
}

export const presenceService = new PresenceService();
