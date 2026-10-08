import { getDb, type DatabaseSync } from './index';
import type {
  User, UserRole, Contact, CallerDisplayInfo,
  Conversation, ConversationSummary,
  Message, MessageKind, Attachment, MessageReceipt,
  CallRecord, CallMedia, CallStatus, UUID, ISODate,
} from '@lan-comm/shared';

// Helper pour convertir une ligne SQL User vers le modèle TypeScript
function mapUserRow(row: any): User {
  return {
    id: row.id,
    username: row.username,
    phoneNumber: row.phone_number,
    displayName: row.display_name,
    role: row.role as UserRole,
    avatarFileId: row.avatar_file_id || null,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || null,
  };
}

export const queries = {
  // ================= USERS =================
  createUser(
    db: DatabaseSync,
    u: {
      id: UUID;
      username: string;
      phoneNumber: string;
      displayName: string;
      passwordHash: string;
      role?: UserRole;
      avatarFileId?: UUID | null;
      createdAt?: ISODate;
    }
  ): User {
    const createdAt = u.createdAt || new Date().toISOString();
    const role = u.role || 'user';
    const stmt = db.prepare(`
      INSERT INTO users (id, username, phone_number, display_name, password_hash, role, avatar_file_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      u.id,
      u.username.toLowerCase(),
      u.phoneNumber,
      u.displayName,
      u.passwordHash,
      role,
      u.avatarFileId || null,
      createdAt
    );
    return {
      id: u.id,
      username: u.username.toLowerCase(),
      phoneNumber: u.phoneNumber,
      displayName: u.displayName,
      role,
      avatarFileId: u.avatarFileId || null,
      createdAt,
      lastSeenAt: null,
    };
  },

  getUserById(db: DatabaseSync, id: UUID): (User & { passwordHash: string }) | null {
    const row: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!row) return null;
    return {
      ...mapUserRow(row),
      passwordHash: row.password_hash,
    };
  },

  getUserByUsername(db: DatabaseSync, username: string): (User & { passwordHash: string }) | null {
    const row: any = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (!row) return null;
    return {
      ...mapUserRow(row),
      passwordHash: row.password_hash,
    };
  },

  getUserByPhone(db: DatabaseSync, phoneNumber: string): (User & { passwordHash: string }) | null {
    const row: any = db.prepare('SELECT * FROM users WHERE phone_number = ?').get(phoneNumber);
    if (!row) return null;
    return {
      ...mapUserRow(row),
      passwordHash: row.password_hash,
    };
  },

  getUserByLogin(db: DatabaseSync, login: string): (User & { passwordHash: string }) | null {
    const row: any = db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR phone_number = ?')
      .get(login, login);
    if (!row) return null;
    return {
      ...mapUserRow(row),
      passwordHash: row.password_hash,
    };
  },

  getAllUsers(db: DatabaseSync, excludeId?: UUID): User[] {
    const rows: any[] = excludeId
      ? (db.prepare('SELECT * FROM users WHERE id != ? ORDER BY display_name ASC').all(excludeId) as any[])
      : (db.prepare('SELECT * FROM users ORDER BY display_name ASC').all() as any[]);
    return rows.map(mapUserRow);
  },

  updateUser(db: DatabaseSync, id: UUID, updates: { displayName?: string; avatarFileId?: UUID | null }): User | null {
    if (updates.displayName !== undefined && updates.avatarFileId !== undefined) {
      db.prepare('UPDATE users SET display_name = ?, avatar_file_id = ? WHERE id = ?').run(
        updates.displayName,
        updates.avatarFileId,
        id
      );
    } else if (updates.displayName !== undefined) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(updates.displayName, id);
    } else if (updates.avatarFileId !== undefined) {
      db.prepare('UPDATE users SET avatar_file_id = ? WHERE id = ?').run(updates.avatarFileId, id);
    }
    const row: any = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? mapUserRow(row) : null;
  },

  updateLastSeen(db: DatabaseSync, id: UUID): void {
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  },

  // ================= CONTACTS & CALLER ID =================
  getContacts(db: DatabaseSync, ownerId: UUID): Array<Contact & { user: User }> {
    const rows: any[] = db
      .prepare(
        `SELECT c.owner_id, c.contact_user_id, c.nickname, c.created_at as contact_created_at,
                u.id as u_id, u.username, u.phone_number, u.display_name, u.role, u.avatar_file_id, u.created_at, u.last_seen_at
         FROM contacts c
         JOIN users u ON u.id = c.contact_user_id
         WHERE c.owner_id = ?
         ORDER BY c.nickname ASC`
      )
      .all(ownerId) as any[];

    return rows.map((r) => ({
      ownerId: r.owner_id,
      contactUserId: r.contact_user_id,
      nickname: r.nickname,
      createdAt: r.contact_created_at,
      user: {
        id: r.u_id,
        username: r.username,
        phoneNumber: r.phone_number,
        displayName: r.display_name,
        role: r.role,
        avatarFileId: r.avatar_file_id || null,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at || null,
      },
    }));
  },

  getContact(db: DatabaseSync, ownerId: UUID, contactUserId: UUID): Contact | null {
    const row: any = db
      .prepare('SELECT * FROM contacts WHERE owner_id = ? AND contact_user_id = ?')
      .get(ownerId, contactUserId);
    if (!row) return null;
    return {
      ownerId: row.owner_id,
      contactUserId: row.contact_user_id,
      nickname: row.nickname,
      createdAt: row.created_at,
    };
  },

  upsertContact(db: DatabaseSync, ownerId: UUID, contactUserId: UUID, nickname: string): Contact {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO contacts (owner_id, contact_user_id, nickname, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id, contact_user_id) DO UPDATE SET nickname = excluded.nickname
    `).run(ownerId, contactUserId, nickname, now);

    return {
      ownerId,
      contactUserId,
      nickname,
      createdAt: now,
    };
  },

  deleteContact(db: DatabaseSync, ownerId: UUID, contactUserId: UUID): void {
    db.prepare('DELETE FROM contacts WHERE owner_id = ? AND contact_user_id = ?').run(ownerId, contactUserId);
  },

  /**
   * Résout la présentation de l'appelant pour l'appelé :
   * - Si l'appelé a l'appelant dans ses contacts -> nom renseigné (nickname ou displayName), isKnown = true
   * - Si l'appelé n'a PAS enregistré l'appelant -> nom = null, isKnown = false (affiche uniquement avatar + téléphone)
   */
  resolveCallerDisplay(db: DatabaseSync, calleeId: UUID, callerId: UUID): CallerDisplayInfo | null {
    const caller = queries.getUserById(db, callerId);
    if (!caller) return null;

    const contact = queries.getContact(db, calleeId, callerId);
    if (contact) {
      return {
        userId: caller.id,
        name: contact.nickname || caller.displayName,
        phoneNumber: caller.phoneNumber,
        avatarFileId: caller.avatarFileId,
        isKnown: true,
      };
    }

    return {
      userId: caller.id,
      name: null,
      phoneNumber: caller.phoneNumber,
      avatarFileId: caller.avatarFileId,
      isKnown: false,
    };
  },

  // ================= CONVERSATIONS =================
  getOrCreateDirectConversation(db: DatabaseSync, userAId: UUID, userBId: UUID): ConversationSummary {
    const [minId, maxId] = [userAId, userBId].sort();
    const directKey = `${minId}:${maxId}`;

    let convRow: any = db.prepare('SELECT * FROM conversations WHERE direct_key = ?').get(directKey);
    let convId: UUID;

    if (!convRow) {
      convId = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO conversations (id, type, direct_key, created_at, last_message_seq)
        VALUES (?, 'direct', ?, ?, NULL)
      `).run(convId, directKey, now);

      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`).run(
        convId,
        userAId,
        now
      );
      db.prepare(`INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`).run(
        convId,
        userBId,
        now
      );

      convRow = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
    } else {
      convId = convRow.id;
    }

    return queries.getConversationSummary(db, convId, userAId)!;
  },

  getConversationById(db: DatabaseSync, convId: UUID): Conversation | null {
    const row: any = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      title: row.title || null,
      createdAt: row.created_at,
      lastMessageSeq: row.last_message_seq || null,
    };
  },

  isConversationMember(db: DatabaseSync, convId: UUID, userId: UUID): boolean {
    const row: any = db
      .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
      .get(convId, userId);
    return !!row;
  },

  getConversationMembers(db: DatabaseSync, convId: UUID): User[] {
    const rows: any[] = db
      .prepare(
        `SELECT u.* FROM users u
         JOIN conversation_members m ON m.user_id = u.id
         WHERE m.conversation_id = ?`
      )
      .all(convId) as any[];
    return rows.map(mapUserRow);
  },

  getUserConversations(db: DatabaseSync, userId: UUID): ConversationSummary[] {
    const convRows: any[] = db
      .prepare(
        `SELECT c.* FROM conversations c
         JOIN conversation_members m ON m.conversation_id = c.id
         WHERE m.user_id = ?
         ORDER BY COALESCE(c.last_message_seq, 0) DESC, c.created_at DESC`
      )
      .all(userId) as any[];

    const summaries: ConversationSummary[] = [];
    for (const row of convRows) {
      const summary = queries.getConversationSummary(db, row.id, userId);
      if (summary) summaries.push(summary);
    }
    return summaries;
  },

  getConversationSummary(db: DatabaseSync, convId: UUID, forUserId: UUID): ConversationSummary | null {
    const conv = queries.getConversationById(db, convId);
    if (!conv) return null;

    const members = queries.getConversationMembers(db, convId);
    const lastMsg = queries.getLastMessageOfConversation(db, convId);

    // Calcul de l'unreadCount
    const memberRow: any = db
      .prepare('SELECT last_read_seq FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
      .get(convId, forUserId);
    const lastReadSeq = memberRow?.last_read_seq || 0;

    const countRow: any = db
      .prepare(
        `SELECT COUNT(*) as count FROM messages
         WHERE conversation_id = ? AND seq > ? AND sender_id != ?`
      )
      .get(convId, lastReadSeq, forUserId);
    const unreadCount = countRow?.count || 0;

    return {
      ...conv,
      members,
      lastMessage: lastMsg,
      unreadCount,
    };
  },

  // ================= MESSAGES =================
  insertMessage(
    db: DatabaseSync,
    m: {
      id: UUID;
      conversationId: UUID;
      senderId: UUID;
      clientMsgId: UUID;
      kind: MessageKind;
      body?: string;
      createdAt?: ISODate;
    }
  ): Message {
    const existing: any = db
      .prepare('SELECT * FROM messages WHERE sender_id = ? AND client_msg_id = ?')
      .get(m.senderId, m.clientMsgId);

    if (existing) {
      const attachments = queries.getMessageAttachments(db, existing.id);
      return {
        id: existing.id,
        seq: existing.seq,
        conversationId: existing.conversation_id,
        senderId: existing.sender_id,
        clientMsgId: existing.client_msg_id,
        kind: existing.kind,
        body: existing.body,
        attachments,
        createdAt: existing.created_at,
        deletedAt: existing.deleted_at || null,
      };
    }

    const now = m.createdAt || new Date().toISOString();
    const body = m.body || '';

    const stmt = db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_id, client_msg_id, kind, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(m.id, m.conversationId, m.senderId, m.clientMsgId, m.kind, body, now);

    const inserted: any = db.prepare('SELECT * FROM messages WHERE id = ?').get(m.id);

    // Mettre à jour last_message_seq de la conversation
    db.prepare('UPDATE conversations SET last_message_seq = ? WHERE id = ?').run(inserted.seq, m.conversationId);

    return {
      id: inserted.id,
      seq: inserted.seq,
      conversationId: inserted.conversation_id,
      senderId: inserted.sender_id,
      clientMsgId: inserted.client_msg_id,
      kind: inserted.kind,
      body: inserted.body,
      attachments: [],
      createdAt: inserted.created_at,
      deletedAt: inserted.deleted_at || null,
    };
  },

  getMessageById(db: DatabaseSync, id: UUID): Message | null {
    const row: any = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!row) return null;
    const attachments = queries.getMessageAttachments(db, row.id);
    return {
      id: row.id,
      seq: row.seq,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      clientMsgId: row.client_msg_id,
      kind: row.kind,
      body: row.body,
      attachments,
      createdAt: row.created_at,
      deletedAt: row.deleted_at || null,
    };
  },

  getLastMessageOfConversation(db: DatabaseSync, convId: UUID): Message | null {
    const row: any = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT 1').get(convId);
    if (!row) return null;
    const attachments = queries.getMessageAttachments(db, row.id);
    return {
      id: row.id,
      seq: row.seq,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      clientMsgId: row.client_msg_id,
      kind: row.kind,
      body: row.body,
      attachments,
      createdAt: row.created_at,
      deletedAt: row.deleted_at || null,
    };
  },

  getConversationMessages(db: DatabaseSync, convId: UUID, beforeSeq?: number, limit = 40): Message[] {
    let rows: any[];
    if (beforeSeq) {
      rows = db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?')
        .all(convId, beforeSeq, limit) as any[];
    } else {
      rows = db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?')
        .all(convId, limit) as any[];
    }

    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      clientMsgId: r.client_msg_id,
      kind: r.kind,
      body: r.body,
      attachments: queries.getMessageAttachments(db, r.id),
      createdAt: r.created_at,
      deletedAt: r.deleted_at || null,
    }));
  },

  /**
   * Rejeu pour le protocole temps réel hello :
   * IMPÉRATIF : Ne sélectionne QUE les messages des conversations dont userId est membre !
   */
  getReplayMessages(db: DatabaseSync, userId: UUID, lastSeq: number, limit = 100): Message[] {
    const rows: any[] = db
      .prepare(
        `SELECT m.* FROM messages m
         JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
         WHERE cm.user_id = ? AND m.seq > ?
         ORDER BY m.seq ASC
         LIMIT ?`
      )
      .all(userId, lastSeq, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      clientMsgId: r.client_msg_id,
      kind: r.kind,
      body: r.body,
      attachments: queries.getMessageAttachments(db, r.id),
      createdAt: r.created_at,
      deletedAt: r.deleted_at || null,
    }));
  },

  // ================= FILES & ATTACHMENTS =================
  insertFile(
    db: DatabaseSync,
    f: {
      id: UUID;
      uploaderId: UUID;
      originalName: string;
      mime: string;
      size: number;
      storagePath: string;
      sha256: string;
      width?: number | null;
      height?: number | null;
      durationSec?: number | null;
    }
  ): Attachment {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO files (id, uploader_id, original_name, mime, size, storage_path, sha256, width, height, duration_sec, attached, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      f.id,
      f.uploaderId,
      f.originalName,
      f.mime,
      f.size,
      f.storagePath,
      f.sha256,
      f.width || null,
      f.height || null,
      f.durationSec || null,
      now
    );

    return {
      id: f.id,
      originalName: f.originalName,
      mime: f.mime,
      size: f.size,
      width: f.width || null,
      height: f.height || null,
      durationSec: f.durationSec || null,
      createdAt: now,
    };
  },

  getFileById(db: DatabaseSync, id: UUID): (Attachment & { uploaderId: UUID; storagePath: string; attached: boolean }) | null {
    const row: any = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      uploaderId: row.uploader_id,
      originalName: row.original_name,
      mime: row.mime,
      size: row.size,
      storagePath: row.storage_path,
      width: row.width || null,
      height: row.height || null,
      durationSec: row.duration_sec || null,
      attached: Boolean(row.attached),
      createdAt: row.created_at,
    };
  },

  attachFileToMessage(db: DatabaseSync, messageId: UUID, fileId: UUID, position = 0): void {
    db.prepare(`
      INSERT OR IGNORE INTO message_attachments (message_id, file_id, position)
      VALUES (?, ?, ?)
    `).run(messageId, fileId, position);

    db.prepare('UPDATE files SET attached = 1 WHERE id = ?').run(fileId);
  },

  getMessageAttachments(db: DatabaseSync, messageId: UUID): Attachment[] {
    const rows: any[] = db
      .prepare(
        `SELECT f.* FROM files f
         JOIN message_attachments ma ON ma.file_id = f.id
         WHERE ma.message_id = ?
         ORDER BY ma.position ASC`
      )
      .all(messageId) as any[];

    return rows.map((r) => ({
      id: r.id,
      originalName: r.original_name,
      mime: r.mime,
      size: r.size,
      width: r.width || null,
      height: r.height || null,
      durationSec: r.duration_sec || null,
      createdAt: r.created_at,
    }));
  },

  getOrphanFiles(db: DatabaseSync, maxAgeMs = 3600000): Array<{ id: UUID; storagePath: string }> {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const rows: any[] = db
      .prepare('SELECT id, storage_path FROM files WHERE attached = 0 AND created_at < ?')
      .all(cutoff) as any[];
    return rows.map((r) => ({ id: r.id, storagePath: r.storage_path }));
  },

  deleteFile(db: DatabaseSync, id: UUID): void {
    db.prepare('DELETE FROM files WHERE id = ?').run(id);
  },

  // ================= RECEIPTS =================
  recordReceiptDelivered(db: DatabaseSync, messageId: UUID, userId: UUID): void {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO message_receipts (message_id, user_id, delivered_at)
      VALUES (?, ?, ?)
      ON CONFLICT(message_id, user_id) DO UPDATE SET delivered_at = COALESCE(delivered_at, excluded.delivered_at)
    `).run(messageId, userId, now);
  },

  recordReceiptRead(db: DatabaseSync, conversationId: UUID, userId: UUID, upToSeq: number): UUID[] {
    const now = new Date().toISOString();

    // Mettre à jour last_read_seq dans conversation_members
    db.prepare(`
      UPDATE conversation_members
      SET last_read_seq = MAX(last_read_seq, ?)
      WHERE conversation_id = ? AND user_id = ?
    `).run(upToSeq, conversationId, userId);

    // Récupérer les messages lus
    const rows: any[] = db
      .prepare(
        `SELECT id FROM messages
         WHERE conversation_id = ? AND seq <= ? AND sender_id != ?`
      )
      .all(conversationId, upToSeq, userId) as any[];

    const updatedIds: UUID[] = [];
    for (const r of rows) {
      db.prepare(`
        INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(message_id, user_id) DO UPDATE SET read_at = COALESCE(read_at, excluded.read_at)
      `).run(r.id, userId, now, now);
      updatedIds.push(r.id);
    }

    return updatedIds;
  },

  getMessageReceipts(db: DatabaseSync, messageId: UUID): MessageReceipt[] {
    const rows: any[] = db.prepare('SELECT * FROM message_receipts WHERE message_id = ?').all(messageId) as any[];
    return rows.map((r) => ({
      messageId: r.message_id,
      userId: r.user_id,
      deliveredAt: r.delivered_at || null,
      readAt: r.read_at || null,
    }));
  },

  // ================= CALLS =================
  insertCall(
    db: DatabaseSync,
    c: {
      id: UUID;
      callerId: UUID;
      calleeId: UUID;
      media: CallMedia;
      status: CallStatus;
      startedAt?: ISODate;
      isUrgent?: boolean;
    }
  ): CallRecord {
    const now = c.startedAt || new Date().toISOString();
    db.prepare(`
      INSERT INTO calls (id, caller_id, callee_id, media, status, started_at, is_urgent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(c.id, c.callerId, c.calleeId, c.media, c.status, now, c.isUrgent ? 1 : 0);

    return {
      id: c.id,
      callerId: c.callerId,
      calleeId: c.calleeId,
      media: c.media,
      status: c.status,
      startedAt: now,
      answeredAt: null,
      endedAt: null,
      durationSec: null,
      endReason: null,
    };
  },

  updateCall(
    db: DatabaseSync,
    id: UUID,
    updates: {
      status?: CallStatus;
      answeredAt?: ISODate | null;
      endedAt?: ISODate | null;
      durationSec?: number | null;
      endReason?: string | null;
    }
  ): CallRecord | null {
    const current: any = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
    if (!current) return null;

    const status = updates.status || current.status;
    const answeredAt = updates.answeredAt !== undefined ? updates.answeredAt : current.answered_at;
    const endedAt = updates.endedAt !== undefined ? updates.endedAt : current.ended_at;
    const durationSec = updates.durationSec !== undefined ? updates.durationSec : current.duration_sec;
    const endReason = updates.endReason !== undefined ? updates.endReason : current.end_reason;

    db.prepare(`
      UPDATE calls
      SET status = ?, answered_at = ?, ended_at = ?, duration_sec = ?, end_reason = ?
      WHERE id = ?
    `).run(status, answeredAt, endedAt, durationSec, endReason, id);

    return {
      id,
      callerId: current.caller_id,
      calleeId: current.callee_id,
      media: current.media,
      status,
      startedAt: current.started_at,
      answeredAt,
      endedAt,
      durationSec,
      endReason,
    };
  },

  getCallById(db: DatabaseSync, id: UUID): CallRecord | null {
    const row: any = db.prepare('SELECT * FROM calls WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      callerId: row.caller_id,
      calleeId: row.callee_id,
      media: row.media,
      status: row.status,
      startedAt: row.started_at,
      answeredAt: row.answered_at || null,
      endedAt: row.ended_at || null,
      durationSec: row.duration_sec || null,
      endReason: row.end_reason || null,
    };
  },

  getUserCalls(db: DatabaseSync, userId: UUID, limit = 50): CallRecord[] {
    const rows: any[] = db
      .prepare('SELECT * FROM calls WHERE caller_id = ? OR callee_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(userId, userId, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      callerId: r.caller_id,
      calleeId: r.callee_id,
      media: r.media,
      status: r.status,
      startedAt: r.started_at,
      answeredAt: r.answered_at || null,
      endedAt: r.ended_at || null,
      durationSec: r.duration_sec || null,
      endReason: r.end_reason || null,
    }));
  },

  getMissedCallsSince(db: DatabaseSync, userId: UUID, since: ISODate): CallRecord[] {
    const rows: any[] = db
      .prepare("SELECT * FROM calls WHERE callee_id = ? AND status = 'missed' AND started_at > ? ORDER BY started_at DESC")
      .all(userId, since) as any[];

    return rows.map((r) => ({
      id: r.id,
      callerId: r.caller_id,
      calleeId: r.callee_id,
      media: r.media,
      status: r.status,
      startedAt: r.started_at,
      answeredAt: null,
      endedAt: r.ended_at || null,
      durationSec: null,
      endReason: r.end_reason || null,
    }));
  },
};
