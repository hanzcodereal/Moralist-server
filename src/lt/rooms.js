// Logika room Dengar Bersama. Room hidup di memori dan disalin ke SQLite agar sesi bisa tersambung lagi setelah server restart.
import crypto from 'node:crypto';
import { db } from '../db.js';
import { encode, decode } from './proto.js';

const GRACE_MS = Number(process.env.LT_GRACE_SEC || 300) * 1000; // waktu tunggu sebelum user terputus dianggap keluar
const HOST_GRACE_MS = Number(process.env.LT_HOST_GRACE_SEC || 45) * 1000; // waktu tunggu sebelum host terputus digantikan
const JOIN_TIMEOUT_MS = 90 * 1000;
const BARRIER_TIMEOUT_MS = 20 * 1000;
const MAX_USERS = Number(process.env.LT_MAX_USERS || 20);
const MAX_ROOMS = Number(process.env.LT_MAX_ROOMS || 2000);
const MAX_QUEUE = 500;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 8; // harus sama dengan ROOM_CODE_LENGTH di aplikasi (ListenTogetherScreen.kt)
const FEATURES = ['server_restarting'];

const rooms = new Map(); // kode -> room
const sessions = new Map(); // token -> {code, userId}
const saveTimers = new Map();

const now = () => Date.now();
const id = () => crypto.randomBytes(8).toString('hex');
const token = () => crypto.randomBytes(24).toString('base64url');
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
const cleanCode = (s) => String(s ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, ROOM_CODE_LENGTH).toUpperCase();
const sanitizeTrack = (t) => t && typeof t.id === 'string' && t.id
  ? { id: t.id.slice(0, 64), title: String(t.title ?? '').slice(0, 300), artist: String(t.artist ?? '').slice(0, 300), album: String(t.album ?? '').slice(0, 300), duration: Math.max(0, Number(t.duration) || 0), thumbnail: String(t.thumbnail ?? '').slice(0, 600), suggested_by: String(t.suggested_by ?? '').slice(0, 64) }
  : null;

export const stats = () => ({
  rooms: rooms.size,
  users: [...rooms.values()].reduce((n, r) => n + r.users.size, 0),
  online: [...rooms.values()].reduce((n, r) => n + [...r.users.values()].filter((u) => u.conn).length, 0),
});
export const roomSummaries = () =>
  [...rooms.values()].map((r) => ({ code: r.code, users: r.users.size, online: [...r.users.values()].filter((u) => u.conn).length, track: r.track?.title ?? null, playing: r.isPlaying, createdAt: r.createdAt }));

// ---------- penyimpanan ----------
function snapshot(room) {
  return JSON.stringify({
    code: room.code, hostId: room.hostId, track: room.track, isPlaying: room.isPlaying, position: room.position, lastUpdate: room.lastUpdate,
    volume: room.volume, queue: room.queue, queueTitle: room.queueTitle, createdAt: room.createdAt,
    users: [...room.users.values()].map((u) => ({ userId: u.userId, username: u.username, token: u.token, joinedAt: u.joinedAt })),
  });
}
function saveNow(room) {
  saveTimers.delete(room.code);
  if (!rooms.has(room.code)) return;
  db.prepare('INSERT INTO lt_rooms(code, data, updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(room.code, snapshot(room), now());
  db.prepare('DELETE FROM lt_sessions WHERE room_code = ?').run(room.code);
  const ins = db.prepare('INSERT OR REPLACE INTO lt_sessions(token, room_code, user_id) VALUES(?,?,?)');
  for (const u of room.users.values()) ins.run(u.token, room.code, u.userId);
}
function save(room) {
  if (saveTimers.has(room.code)) return;
  const t = setTimeout(() => saveNow(room), 300);
  t.unref();
  saveTimers.set(room.code, t);
}
export function flushAll() {
  for (const room of rooms.values()) saveNow(room);
}
function dropRoom(room) {
  rooms.delete(room.code);
  clearTimeout(saveTimers.get(room.code));
  saveTimers.delete(room.code);
  clearTimeout(room.barrier?.timer);
  for (const u of room.users.values()) { clearTimeout(u.graceTimer); sessions.delete(u.token); }
  for (const p of room.pending.values()) clearTimeout(p.timer);
  db.prepare('DELETE FROM lt_rooms WHERE code = ?').run(room.code);
  db.prepare('DELETE FROM lt_sessions WHERE room_code = ?').run(room.code);
}

export function loadRooms() {
  for (const row of db.prepare('SELECT code, data FROM lt_rooms').all()) {
    let d;
    try { d = JSON.parse(row.data); } catch { continue; }
    const room = newRoom(d.code, d.createdAt);
    Object.assign(room, { hostId: d.hostId, track: d.track, isPlaying: false, position: d.position || 0, lastUpdate: now(), volume: d.volume ?? 1, queue: d.queue || [], queueTitle: d.queueTitle || '' });
    for (const u of d.users) {
      const user = { userId: u.userId, username: u.username, token: u.token, joinedAt: u.joinedAt, conn: null, graceTimer: null };
      room.users.set(u.userId, user);
      sessions.set(u.token, { code: room.code, userId: u.userId });
    }
    if (!room.users.size) { db.prepare('DELETE FROM lt_rooms WHERE code = ?').run(room.code); continue; }
    if (!room.users.has(room.hostId)) room.hostId = [...room.users.values()][0].userId;
    rooms.set(room.code, room);
    for (const u of room.users.values()) scheduleGrace(room, u);
  }
  return rooms.size;
}

function newRoom(code, createdAt = now()) {
  return { code, hostId: '', users: new Map(), pending: new Map(), track: null, isPlaying: false, position: 0, lastUpdate: now(), volume: 1, queue: [], queueTitle: '', createdAt, barrier: null, suggestions: new Map() };
}

// ---------- kirim ----------
const send = (conn, type, payload, requestId = 0) => {
  if (!conn || conn.closed) return;
  try { conn.sendBinary(encode(type, payload, requestId)); } catch { /* koneksi sudah putus */ }
};
const sendError = (conn, code, message, requestId = 0) => send(conn, 'error', { code, message }, requestId);
const toUsers = (room, type, payload, except = null) => {
  for (const u of room.users.values()) if (u.conn && u.userId !== except) send(u.conn, type, payload);
};
const host = (room) => room.users.get(room.hostId);

function roomState(room) {
  return {
    room_code: room.code, host_id: room.hostId,
    users: [...room.users.values()].sort((a, b) => a.joinedAt - b.joinedAt).map((u) => ({ user_id: u.userId, username: u.username, is_host: u.userId === room.hostId, is_connected: Boolean(u.conn) })),
    current_track: room.track || undefined, is_playing: room.isPlaying, position: room.position, last_update: room.lastUpdate,
    volume: room.volume, queue: room.queue, revision: 0, queue_title: room.queueTitle,
  };
}

// ---------- siklus hidup user ----------
function scheduleGrace(room, user) {
  clearTimeout(user.graceTimer);
  const wait = user.userId === room.hostId ? HOST_GRACE_MS : GRACE_MS;
  user.graceTimer = setTimeout(() => {
    if (user.conn || !rooms.has(room.code)) return;
    if (user.userId === room.hostId) {
      const next = pickNextHost(room, user.userId, true);
      if (next) { setHost(room, next); user.graceTimer = setTimeout(() => !user.conn && removeUser(room, user.userId), Math.max(GRACE_MS - HOST_GRACE_MS, 1000)); user.graceTimer.unref(); return; }
    }
    removeUser(room, user.userId);
  }, wait);
  user.graceTimer.unref();
}

function pickNextHost(room, excludeId, connectedOnly) {
  return [...room.users.values()].filter((u) => u.userId !== excludeId && (!connectedOnly || u.conn)).sort((a, b) => a.joinedAt - b.joinedAt)[0] || null;
}
function setHost(room, user) {
  room.hostId = user.userId;
  toUsers(room, 'host_changed', { new_host_id: user.userId, new_host_name: user.username });
  save(room);
}

function removeUser(room, userId) {
  const user = room.users.get(userId);
  if (!user) return;
  clearTimeout(user.graceTimer);
  room.users.delete(userId);
  sessions.delete(user.token);
  if (user.conn) { user.conn.room = null; user.conn.userId = null; }
  if (room.barrier) { room.barrier.waiting.delete(userId); checkBarrier(room); }
  for (const [sid, s] of room.suggestions) if (s.fromUserId === userId) room.suggestions.delete(sid);
  if (!room.users.size) return dropRoom(room);
  const wasHost = room.hostId === userId;
  if (wasHost) {
    const next = pickNextHost(room, userId, true) || pickNextHost(room, userId, false);
    if (next) setHost(room, next);
  }
  toUsers(room, 'user_left', { user_id: userId, username: user.username });
  save(room);
}

export function onDisconnect(conn) {
  for (const room of rooms.values()) {
    for (const [pid, p] of room.pending) if (p.conn === conn) { clearTimeout(p.timer); room.pending.delete(pid); }
  }
  const room = conn.room && rooms.get(conn.room);
  const user = room?.users.get(conn.userId);
  if (!room || !user || user.conn !== conn) return;
  user.conn = null;
  toUsers(room, 'user_disconnected', { user_id: user.userId, username: user.username });
  scheduleGrace(room, user);
}

// ---------- barrier buffer ----------
function startBarrier(room, trackId) {
  clearTimeout(room.barrier?.timer);
  const waiting = new Set([...room.users.values()].filter((u) => u.conn && u.userId !== room.hostId).map((u) => u.userId));
  if (!waiting.size) { room.barrier = null; return; }
  room.barrier = { trackId, waiting, timer: setTimeout(() => completeBarrier(room), BARRIER_TIMEOUT_MS) };
  room.barrier.timer.unref();
  toUsers(room, 'buffer_wait', { track_id: trackId, waiting_for: [...waiting] });
}
function checkBarrier(room) {
  if (room.barrier && !room.barrier.waiting.size) completeBarrier(room);
}
function completeBarrier(room) {
  const b = room.barrier;
  if (!b) return;
  clearTimeout(b.timer);
  room.barrier = null;
  toUsers(room, 'buffer_complete', { track_id: b.trackId });
}

// ---------- penanganan pesan ----------
const requireRoom = (conn, requestId) => {
  const room = conn.room && rooms.get(conn.room);
  const user = room?.users.get(conn.userId);
  if (!room || !user) { sendError(conn, 'not_in_room', 'Kamu belum berada di room', requestId); return null; }
  return { room, user };
};
const requireHost = (conn, requestId) => {
  const ctx = requireRoom(conn, requestId);
  if (!ctx) return null;
  if (ctx.room.hostId !== ctx.user.userId) { sendError(conn, 'not_host', 'Hanya host yang bisa melakukan ini', requestId); return null; }
  return ctx;
};
const ack = (conn, requestId) => requestId && send(conn, 'ack', {}, requestId);

function uniqueCode() {
  for (let i = 0; i < 20; i++) {
    let code = '';
    for (let j = 0; j < ROOM_CODE_LENGTH; j++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function attach(room, user, conn) {
  if (user.conn && user.conn !== conn) { user.conn.room = null; user.conn.userId = null; user.conn.close(4000, 'replaced'); }
  clearTimeout(user.graceTimer);
  user.conn = conn;
  conn.room = room.code;
  conn.userId = user.userId;
}

function applyPlayback(room, user, p, requestId, conn) {
  const t = now();
  let captured = p.captured_at_server_time || t;
  if (captured > t || captured < t - 10_000) captured = t;
  const out = { action: p.action, track_id: p.track_id, origin_user_id: user.userId, host_sequence: p.host_sequence };
  let toAll = false;
  switch (p.action) {
    case 'play':
    case 'pause':
    case 'seek':
      if (p.action !== 'seek') room.isPlaying = p.action === 'play';
      room.position = p.position || 0;
      room.lastUpdate = captured;
      Object.assign(out, { position: room.position, server_time: captured });
      break;
    case 'change_track': {
      const track = sanitizeTrack(p.track_info);
      if (!track) return sendError(conn, 'invalid_track', 'Data lagu tidak valid', requestId);
      room.track = track;
      room.position = p.position || 0;
      room.isPlaying = false;
      room.lastUpdate = t;
      if (p.replace_queue) {
        room.queue = (p.queue || []).map(sanitizeTrack).filter(Boolean).slice(0, MAX_QUEUE);
        room.queueTitle = p.queue_title || '';
      }
      Object.assign(out, { track_id: track.id, track_info: track, position: room.position, server_time: t, replace_queue: p.replace_queue, queue: p.replace_queue ? room.queue : undefined, queue_title: p.replace_queue ? room.queueTitle : undefined });
      startBarrier(room, track.id);
      break;
    }
    case 'skip_next':
    case 'skip_prev':
      break;
    case 'queue_add': {
      const track = sanitizeTrack(p.track_info);
      if (!track) return sendError(conn, 'invalid_track', 'Data lagu tidak valid', requestId);
      if (room.queue.length >= MAX_QUEUE) return sendError(conn, 'queue_too_large', 'Antrean terlalu panjang', requestId);
      room.queue = p.insert_next ? [track, ...room.queue] : [...room.queue, track];
      Object.assign(out, { track_info: track, insert_next: p.insert_next });
      break;
    }
    case 'queue_remove':
      room.queue = room.queue.filter((q) => q.id !== p.track_id);
      break;
    case 'queue_clear':
      room.queue = [];
      break;
    case 'sync_queue': {
      const queue = (p.queue || []).map(sanitizeTrack).filter(Boolean);
      if (queue.length > MAX_QUEUE) return sendError(conn, 'queue_too_large', 'Antrean terlalu panjang', requestId);
      room.queue = queue;
      room.queueTitle = p.queue_title || '';
      Object.assign(out, { queue, queue_title: room.queueTitle });
      break;
    }
    case 'set_volume':
      room.volume = Math.min(1, Math.max(0, Number.isFinite(p.volume) ? p.volume : 1));
      out.volume = room.volume;
      break;
    default:
      return sendError(conn, 'invalid_action', 'Aksi tidak dikenal', requestId);
  }
  toUsers(room, 'sync_playback', out, toAll ? null : user.userId);
  ack(conn, requestId);
  save(room);
}

const handlers = {
  create_room(conn, p, rid) {
    if (conn.room) return sendError(conn, 'already_in_room', 'Kamu sudah berada di room', rid);
    const username = cleanName(p.username);
    if (!username) return sendError(conn, 'invalid_username', 'Nama pengguna tidak boleh kosong', rid);
    if (rooms.size >= MAX_ROOMS) return sendError(conn, 'server_full', 'Server penuh, coba lagi nanti', rid);
    const code = uniqueCode();
    if (!code) return sendError(conn, 'server_full', 'Server penuh, coba lagi nanti', rid);
    const room = newRoom(code);
    const user = { userId: id(), username, token: token(), joinedAt: now(), conn: null, graceTimer: null };
    room.users.set(user.userId, user);
    room.hostId = user.userId;
    rooms.set(code, room);
    sessions.set(user.token, { code, userId: user.userId });
    attach(room, user, conn);
    send(conn, 'room_created', { room_code: code, user_id: user.userId, session_token: user.token }, rid);
    saveNow(room);
  },

  join_room(conn, p, rid) {
    if (conn.room || conn.pendingRoom) return sendError(conn, 'already_in_room', 'Kamu sudah berada di room', rid);
    const username = cleanName(p.username);
    if (!username) return sendError(conn, 'invalid_username', 'Nama pengguna tidak boleh kosong', rid);
    const room = rooms.get(cleanCode(p.room_code));
    if (!room) return sendError(conn, 'room_not_found', 'Room tidak ditemukan', rid);
    if (room.users.size + room.pending.size >= MAX_USERS) return sendError(conn, 'room_full', 'Room sudah penuh', rid);
    if ([...room.users.values()].some((u) => u.username.toLowerCase() === username.toLowerCase())) return sendError(conn, 'username_taken', 'Nama itu sudah dipakai di room ini', rid);
    const hostUser = host(room);
    if (!hostUser?.conn) return sendError(conn, 'host_offline', 'Host sedang tidak terhubung', rid);
    const userId = id();
    const timer = setTimeout(() => {
      const pending = room.pending.get(userId);
      if (!pending) return;
      room.pending.delete(userId);
      conn.pendingRoom = null;
      send(conn, 'join_rejected', { reason: 'timeout' });
    }, JOIN_TIMEOUT_MS);
    timer.unref();
    room.pending.set(userId, { userId, username, conn, timer });
    conn.pendingRoom = room.code;
    send(hostUser.conn, 'join_request', { user_id: userId, username });
    ack(conn, rid);
  },

  approve_join(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (!ctx) return;
    const { room } = ctx;
    const pending = room.pending.get(p.user_id);
    if (!pending) return sendError(conn, 'user_not_found', 'Permintaan gabung tidak ditemukan', rid);
    clearTimeout(pending.timer);
    room.pending.delete(p.user_id);
    if (pending.conn.closed) return ack(conn, rid);
    const user = { userId: pending.userId, username: pending.username, token: token(), joinedAt: now(), conn: null, graceTimer: null };
    room.users.set(user.userId, user);
    sessions.set(user.token, { code: room.code, userId: user.userId });
    pending.conn.pendingRoom = null;
    attach(room, user, pending.conn);
    send(pending.conn, 'join_approved', { room_code: room.code, user_id: user.userId, session_token: user.token, state: roomState(room) });
    toUsers(room, 'user_joined', { user_id: user.userId, username: user.username }, user.userId);
    ack(conn, rid);
    saveNow(room);
  },

  reject_join(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (!ctx) return;
    const pending = ctx.room.pending.get(p.user_id);
    if (!pending) return sendError(conn, 'user_not_found', 'Permintaan gabung tidak ditemukan', rid);
    clearTimeout(pending.timer);
    ctx.room.pending.delete(p.user_id);
    pending.conn.pendingRoom = null;
    send(pending.conn, 'join_rejected', { reason: p.reason || 'rejected_by_host' });
    ack(conn, rid);
  },

  leave_room(conn, _p, rid) {
    const ctx = requireRoom(conn, rid);
    if (!ctx) return;
    ack(conn, rid);
    removeUser(ctx.room, ctx.user.userId);
  },

  playback_action(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (ctx) applyPlayback(ctx.room, ctx.user, p, rid, conn);
  },

  buffer_ready(conn, p, rid) {
    const ctx = requireRoom(conn, rid);
    if (!ctx) return;
    const b = ctx.room.barrier;
    if (b && b.trackId === p.track_id) { b.waiting.delete(ctx.user.userId); checkBarrier(ctx.room); }
    ack(conn, rid);
  },

  kick_user(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (!ctx) return;
    const target = ctx.room.users.get(p.user_id);
    if (!target || target.userId === ctx.user.userId) return sendError(conn, 'user_not_found', 'Pengguna tidak ditemukan', rid);
    send(target.conn, 'kicked', { reason: p.reason || 'kicked_by_host' });
    ack(conn, rid);
    removeUser(ctx.room, target.userId);
  },

  transfer_host(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (!ctx) return;
    const target = ctx.room.users.get(p.new_host_id);
    if (!target || !target.conn) return sendError(conn, 'user_not_found', 'Pengguna tidak ditemukan atau sedang offline', rid);
    setHost(ctx.room, target);
    ack(conn, rid);
  },

  ping(conn, p, rid, receivedAt) {
    send(conn, 'pong', { client_time: p.client_time, server_receive_time: receivedAt, server_send_time: now(), sequence: p.sequence }, rid);
  },

  request_sync(conn, _p, rid) {
    const ctx = requireRoom(conn, rid);
    if (!ctx) return;
    const t = now();
    if (t - (conn.lastSync || 0) < 400) return sendError(conn, 'sync_rate_limited', 'Terlalu sering meminta sinkronisasi', rid);
    conn.lastSync = t;
    const r = ctx.room;
    send(conn, 'sync_state', { current_track: r.track || undefined, is_playing: r.isPlaying, position: r.position, last_update: r.lastUpdate, queue: r.queue, volume: r.volume, revision: 0, queue_title: r.queueTitle }, rid);
  },

  reconnect(conn, p, rid) {
    const s = sessions.get(p.session_token);
    const room = s && rooms.get(s.code);
    const user = room?.users.get(s?.userId);
    if (!user) return sendError(conn, 'session_not_found', 'Sesi tidak ditemukan', rid);
    const wasOffline = !user.conn;
    attach(room, user, conn);
    send(conn, 'reconnected', { room_code: room.code, user_id: user.userId, state: roomState(room), is_host: room.hostId === user.userId }, rid);
    if (wasOffline) toUsers(room, 'user_reconnected', { user_id: user.userId, username: user.username }, user.userId);
  },

  suggest_track(conn, p, rid) {
    const ctx = requireRoom(conn, rid);
    if (!ctx) return;
    const { room, user } = ctx;
    if (room.hostId === user.userId) return sendError(conn, 'host_cannot_suggest', 'Host bisa langsung menambah lagu', rid);
    const track = sanitizeTrack(p.track_info);
    if (!track) return sendError(conn, 'invalid_track', 'Data lagu tidak valid', rid);
    if ([...room.suggestions.values()].some((s) => s.fromUserId === user.userId && s.track.id === track.id)) return sendError(conn, 'duplicate_suggestion', 'Lagu itu sudah kamu sarankan', rid);
    if (room.suggestions.size >= 100) return sendError(conn, 'suggestion_limit', 'Terlalu banyak saran tertunda', rid);
    const sid = id();
    track.suggested_by = user.username;
    room.suggestions.set(sid, { id: sid, fromUserId: user.userId, track });
    send(conn, 'suggestion_submitted', { suggestion_id: sid, track_info: track }, rid);
    send(host(room)?.conn, 'suggestion_received', { suggestion_id: sid, from_user_id: user.userId, from_username: user.username, track_info: track });
  },

  approve_suggestion(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (!ctx) return;
    const { room } = ctx;
    const s = room.suggestions.get(p.suggestion_id);
    if (!s) return sendError(conn, 'suggestion_not_found', 'Saran tidak ditemukan', rid);
    if (room.queue.length >= MAX_QUEUE) return sendError(conn, 'queue_too_large', 'Antrean terlalu panjang', rid);
    room.suggestions.delete(p.suggestion_id);
    room.queue = [...room.queue, s.track];
    toUsers(room, 'sync_playback', { action: 'queue_add', track_id: s.track.id, track_info: s.track }); // ke semua, termasuk host
    send(room.users.get(s.fromUserId)?.conn, 'suggestion_approved', { suggestion_id: s.id, track_info: s.track });
    send(conn, 'suggestion_approved', { suggestion_id: s.id, track_info: s.track }, rid);
    save(room);
  },

  reject_suggestion(conn, p, rid) {
    const ctx = requireHost(conn, rid);
    if (!ctx) return;
    const { room } = ctx;
    const s = room.suggestions.get(p.suggestion_id);
    if (!s) return sendError(conn, 'suggestion_not_found', 'Saran tidak ditemukan', rid);
    room.suggestions.delete(p.suggestion_id);
    send(room.users.get(s.fromUserId)?.conn, 'suggestion_rejected', { suggestion_id: s.id, reason: p.reason });
    send(conn, 'suggestion_rejected', { suggestion_id: s.id, reason: p.reason }, rid);
  },
};

/** Titik masuk tiap koneksi WebSocket baru. */
export function handleConnection(conn) {
  conn.capsDone = false;
  const bucket = { count: 0, reset: now() + 10_000 };
  conn.on('message', (data) => {
    const receivedAt = now();
    if (receivedAt > bucket.reset) { bucket.count = 0; bucket.reset = receivedAt + 10_000; }
    if (++bucket.count > 200) return conn.close(1008, 'rate limit');
    let env;
    try { env = decode(data); } catch { return conn.close(1002, 'pesan tidak valid'); }
    if (!conn.capsDone) {
      if (env.type !== 'client_capabilities') return conn.close(1002, 'capabilities diperlukan');
      conn.capsDone = true;
      return send(conn, 'server_capabilities', { supports_protobuf: true, supports_compression: false, server_version: 'moralist-1', features: FEATURES, can_host: true });
    }
    const handler = handlers[env.type];
    if (!handler) return;
    try {
      handler(conn, env.payload, env.requestId, receivedAt);
    } catch (e) {
      console.error('Kesalahan menangani', env.type, e);
      sendError(conn, 'internal_error', 'Terjadi kesalahan di server', env.requestId);
    }
  });
  conn.on('close', () => onDisconnect(conn));
}

export function announceRestart(etaMs = 5000) {
  for (const room of rooms.values()) toUsers(room, 'server_restarting', { eta_ms: etaMs, reason: 'Server dimulai ulang' });
}

// Bersihkan room yang semua penggunanya offline dan tidak punya penghitung tunggu lagi.
setInterval(() => {
  for (const room of [...rooms.values()]) {
    const users = [...room.users.values()];
    if (!users.some((u) => u.conn) && !users.some((u) => u.graceTimer)) dropRoom(room);
  }
}, 60_000).unref();
