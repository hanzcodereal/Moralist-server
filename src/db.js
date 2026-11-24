import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const APK_DIR = path.join(DATA_DIR, 'apk');
fs.mkdirSync(APK_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'moralist.db'));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'none',   -- none | upload | external
  file_name TEXT,
  external_url TEXT,
  size INTEGER,
  sha256 TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS lt_rooms (
  code TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lt_sessions (
  token TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  user_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
`);

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const isVersion = (v) => typeof v === 'string' && SEMVER.test(v);
export function compareVersions(a, b) {
  const pa = a.match(SEMVER).slice(1).map(Number);
  const pb = b.match(SEMVER).slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

export const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
export const setSetting = (key, value) =>
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);

export const listReleases = () =>
  db.prepare('SELECT * FROM releases').all().sort((a, b) => compareVersions(b.version, a.version));
/** Rilis yang sudah dipublikasikan dan punya berkas yang bisa diunduh, terbaru dulu. */
export const publishedReleases = () => listReleases().filter((r) => r.published && r.source !== 'none' && r.sha256 && r.size);
export const getRelease = (version) => db.prepare('SELECT * FROM releases WHERE version = ?').get(version);
