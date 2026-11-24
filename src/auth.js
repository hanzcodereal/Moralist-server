import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const COOKIE = 'mor_sid';

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Menyiapkan akun admin. ADMIN_USER dan ADMIN_PASSWORD di env selalu menang; tanpa itu dibuat sandi acak sekali. */
export function seedAdmin() {
  const envUser = process.env.ADMIN_USER;
  const envPass = process.env.ADMIN_PASSWORD;
  if (envPass) {
    setSetting('admin_user', envUser || 'admin');
    setSetting('admin_hash', hashPassword(envPass));
    return;
  }
  if (!getSetting('admin_hash')) {
    const generated = crypto.randomBytes(9).toString('base64url');
    setSetting('admin_user', envUser || 'admin');
    setSetting('admin_hash', hashPassword(generated));
    console.log('==============================================');
    console.log(' Akun admin dibuat (hanya tampil sekali).');
    console.log(` Username : ${getSetting('admin_user')}`);
    console.log(` Password : ${generated}`);
    console.log(' Ganti lewat panel /admin atau set ADMIN_PASSWORD.');
    console.log('==============================================');
  }
}

export function checkLogin(username, password) {
  const userOk = String(username) === getSetting('admin_user');
  const passOk = verifyPassword(String(password), getSetting('admin_hash'));
  return userOk && passOk;
}
export const changePassword = (password) => setSetting('admin_hash', hashPassword(password));
export const adminUsername = () => getSetting('admin_user');

const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');
export function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions(token_hash, expires_at) VALUES(?, ?)').run(digest(token), Date.now() + SESSION_MS);
  return { token, maxAge: SESSION_MS / 1000 };
}
export function sessionValid(token) {
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(digest(token));
  return Boolean(row && row.expires_at > Date.now());
}
export const destroySession = (token) => token && db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
export const destroyAllSessions = () => db.exec('DELETE FROM sessions');

const attempts = new Map();
/** Maksimal 5 percobaan login gagal per IP dalam 15 menit. */
export function loginAllowed(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset < now) return true;
  return entry.count < 5;
}
export function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset < now) attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
  else entry.count += 1;
}
export const clearLoginFailures = (ip) => attempts.delete(ip);
