// server/src/db/index.ts
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config';

const sqliteModule = (process as any).getBuiltinModule
  ? (process as any).getBuiltinModule('node:sqlite')
  : require('node:sqlite');
const DatabaseSync = sqliteModule.DatabaseSync;
export type DatabaseSync = any;

let instance: DatabaseSync | null = null;

export function initDb(customPath?: string): DatabaseSync {
  const dbPath = customPath || CONFIG.DB_PATH;
  const isMemory = dbPath === ':memory:';

  if (!isMemory) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = ON;');
  if (!isMemory) {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schemaSql);
  }

  instance = db;
  return db;
}

export function getDb(): DatabaseSync {
  if (!instance) {
    instance = initDb();
  }
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
