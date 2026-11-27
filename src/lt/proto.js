// Codec protobuf Dengar Bersama. Nomor field mengikuti PortableMessageCodec di aplikasi.
import zlib from 'node:zlib';

const MAX_ENVELOPE = 256 * 1024;
const MAX_PAYLOAD = 2 * 1024 * 1024;

// Tipe: s string, l long, b bool, f float, T track, R room, U user, [x] berulang
const TRACK = { id: [1, 's'], title: [2, 's'], artist: [3, 's'], album: [4, 's'], duration: [5, 'l'], thumbnail: [6, 's'], suggested_by: [7, 's'] };
const USER = { user_id: [1, 's'], username: [2, 's'], is_host: [3, 'b'], is_connected: [4, 'b'] };
const ROOM = {
  room_code: [1, 's'], host_id: [2, 's'], users: [3, '[U]'], current_track: [4, 'T'], is_playing: [5, 'b'], position: [6, 'l'],
  last_update: [7, 'l'], volume: [8, 'f'], queue: [9, '[T]'], revision: [10, 'l'], queue_title: [11, 's'],
};
const CHAT = { message_id: [1, 's'], user_id: [2, 's'], username: [3, 's'], text: [4, 's'], timestamp: [5, 'l'] };
const NESTED = { T: TRACK, U: USER, R: ROOM, C: CHAT };

export const SCHEMAS = {
  create_room: { username: [1, 's'] },
  join_room: { room_code: [1, 's'], username: [2, 's'] },
  approve_join: { user_id: [1, 's'] },
  reject_join: { user_id: [1, 's'], reason: [2, 's'] },
  playback_action: {
    action: [1, 's'], track_id: [2, 's'], position: [3, 'l'], track_info: [4, 'T'], insert_next: [5, 'b'], queue: [6, '[T]'],
    queue_title: [7, 's'], volume: [8, 'f'], server_time: [9, 'l'], revision: [10, 'l'], captured_at_server_time: [11, 'l'],
    replace_queue: [12, 'b'], origin_user_id: [13, 's'], host_sequence: [14, 'l'],
  },
  buffer_ready: { track_id: [1, 's'], track_revision: [2, 'l'] },
  kick_user: { user_id: [1, 's'], reason: [2, 's'] },
  transfer_host: { new_host_id: [1, 's'] },
  ping: {
    client_time: [1, 'l'], sequence: [2, 'l'], has_position: [3, 'b'], track_id: [4, 's'], position: [5, 'l'],
    position_captured_at_server_time: [6, 'l'], has_state_hash: [7, 'b'], state_hash: [8, 'l'],
  },
  reconnect: { session_token: [1, 's'] },
  suggest_track: { track_info: [1, 'T'] },
  approve_suggestion: { suggestion_id: [1, 's'] },
  reject_suggestion: { suggestion_id: [1, 's'], reason: [2, 's'] },
  send_chat: { text: [1, 's'] },
  client_capabilities: { supports_protobuf: [1, 'b'], supports_compression: [2, 'b'], client_version: [3, 's'], features: [4, '[s]'] },

  room_created: { room_code: [1, 's'], user_id: [2, 's'], session_token: [3, 's'] },
  join_request: { user_id: [1, 's'], username: [2, 's'] },
  join_approved: { room_code: [1, 's'], user_id: [2, 's'], session_token: [3, 's'], state: [4, 'R'] },
  join_rejected: { reason: [1, 's'] },
  user_joined: { user_id: [1, 's'], username: [2, 's'] },
  user_left: { user_id: [1, 's'], username: [2, 's'] },
  sync_playback: null, // memakai skema playback_action
  buffer_wait: { track_id: [1, 's'], waiting_for: [2, '[s]'] },
  buffer_complete: { track_id: [1, 's'] },
  error: { code: [1, 's'], message: [2, 's'] },
  pong: {
    client_time: [1, 'l'], server_receive_time: [2, 'l'], server_send_time: [3, 'l'], sequence: [4, 'l'], drift_valid: [5, 'b'],
    drift_ms: [6, 'l'], state_mismatch: [7, 'b'],
  },
  host_changed: { new_host_id: [1, 's'], new_host_name: [2, 's'] },
  kicked: { reason: [1, 's'] },
  sync_state: {
    current_track: [1, 'T'], is_playing: [2, 'b'], position: [3, 'l'], last_update: [4, 'l'], queue: [5, '[T]'], volume: [6, 'f'],
    revision: [7, 'l'], queue_title: [8, 's'],
  },
  reconnected: { room_code: [1, 's'], user_id: [2, 's'], state: [3, 'R'], is_host: [4, 'b'] },
  user_reconnected: { user_id: [1, 's'], username: [2, 's'] },
  user_disconnected: { user_id: [1, 's'], username: [2, 's'] },
  suggestion_received: { suggestion_id: [1, 's'], from_user_id: [2, 's'], from_username: [3, 's'], track_info: [4, 'T'] },
  suggestion_approved: { suggestion_id: [1, 's'], track_info: [2, 'T'] },
  suggestion_rejected: { suggestion_id: [1, 's'], reason: [2, 's'] },
  server_capabilities: { supports_protobuf: [1, 'b'], supports_compression: [2, 'b'], server_version: [3, 's'], features: [4, '[s]'], can_host: [5, 'b'] },
  server_restarting: { eta_ms: [1, 'l'], reason: [2, 's'] },
  suggestion_submitted: { suggestion_id: [1, 's'], track_info: [2, 'T'] },
  chat_message: CHAT,
  chat_history: { messages: [1, '[C]'] },
  // tanpa payload
  leave_room: {}, request_sync: {}, ack: {},
};
SCHEMAS.sync_playback = SCHEMAS.playback_action;
export const KNOWN_TYPES = new Set(Object.keys(SCHEMAS));

class Writer {
  constructor() { this.parts = []; }
  varint(value) {
    const bytes = [];
    let v = Math.max(0, Math.floor(value));
    while (v >= 128) { bytes.push((v % 128) | 128); v = Math.floor(v / 128); }
    bytes.push(v);
    this.parts.push(Buffer.from(bytes));
  }
  tag(field, wire) { this.varint(field * 8 + wire); }
  bytes(field, buf) { this.tag(field, 2); this.varint(buf.length); this.parts.push(buf); }
  done() { return Buffer.concat(this.parts); }
}

function encodeMessage(schema, obj) {
  const w = new Writer();
  for (const [name, [field, type]] of Object.entries(schema)) {
    const value = obj?.[name];
    if (value === undefined || value === null) continue;
    if (type.startsWith('[')) {
      const inner = type.slice(1, -1);
      for (const item of value) {
        if (inner === 's') w.bytes(field, Buffer.from(String(item), 'utf8'));
        else w.bytes(field, encodeMessage(NESTED[inner], item));
      }
    } else if (type === 's') {
      if (value !== '') w.bytes(field, Buffer.from(String(value), 'utf8'));
    } else if (type === 'l') {
      if (value) { w.tag(field, 0); w.varint(Number(value)); }
    } else if (type === 'b') {
      if (value) { w.tag(field, 0); w.varint(1); }
    } else if (type === 'f') {
      const bits = Buffer.alloc(4);
      bits.writeFloatLE(value);
      if (bits.readUInt32LE() !== 0) { w.tag(field, 5); w.parts.push(bits); }
    } else {
      w.bytes(field, encodeMessage(NESTED[type], value));
    }
  }
  return w.done();
}

function readVarint(buf, pos) {
  let value = 0;
  for (let i = 0; i < 10; i++) {
    if (pos.i >= buf.length) throw new Error('varint terpotong');
    const b = buf[pos.i++];
    value += (b & 0x7f) * 2 ** (7 * i);
    if (!(b & 0x80)) return value;
  }
  throw new Error('varint tidak valid');
}

function parseFields(buf) {
  const out = new Map();
  const pos = { i: 0 };
  let count = 0;
  while (pos.i < buf.length) {
    if (++count > 16384) throw new Error('terlalu banyak field');
    const tag = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    let item;
    if (wire === 0) item = { wire, num: readVarint(buf, pos) };
    else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (len > buf.length - pos.i) throw new Error('panjang field tidak valid');
      item = { wire, bytes: buf.subarray(pos.i, pos.i + len) };
      pos.i += len;
    } else if (wire === 5) {
      if (pos.i + 4 > buf.length) throw new Error('fixed32 terpotong');
      item = { wire, bytes: buf.subarray(pos.i, pos.i + 4) };
      pos.i += 4;
    } else if (wire === 1) {
      if (pos.i + 8 > buf.length) throw new Error('fixed64 terpotong');
      pos.i += 8;
      continue;
    } else throw new Error(`wire type ${wire} tidak didukung`);
    if (!out.has(field)) out.set(field, []);
    out.get(field).push(item);
  }
  return out;
}

function decodeMessage(schema, buf) {
  const fields = parseFields(buf);
  const out = {};
  for (const [name, [field, type]] of Object.entries(schema)) {
    const items = fields.get(field) || [];
    const last = items[items.length - 1];
    if (type.startsWith('[')) {
      const inner = type.slice(1, -1);
      out[name] = items.map((it) => (inner === 's' ? it.bytes.toString('utf8') : decodeMessage(NESTED[inner], it.bytes)));
    } else if (type === 's') out[name] = last?.bytes ? last.bytes.toString('utf8') : '';
    else if (type === 'l') out[name] = last?.num ?? 0;
    else if (type === 'b') out[name] = (last?.num ?? 0) !== 0;
    else if (type === 'f') out[name] = last?.bytes ? last.bytes.readFloatLE(0) : 0;
    else out[name] = last ? decodeMessage(NESTED[type], Buffer.concat(items.map((i) => i.bytes))) : undefined;
  }
  return out;
}

export function encode(type, payload, requestId = 0) {
  if (!KNOWN_TYPES.has(type)) throw new Error(`tipe pesan tidak dikenal: ${type}`);
  const body = encodeMessage(SCHEMAS[type], payload);
  if (body.length > MAX_PAYLOAD) throw new Error('payload terlalu besar');
  const w = new Writer();
  w.bytes(1, Buffer.from(type));
  if (body.length) w.bytes(2, body);
  if (requestId) { w.tag(4, 0); w.varint(requestId); }
  return w.done();
}

/** Mengembalikan {type, payload, requestId}; melempar Error jika bingkai tidak valid. */
export function decode(data) {
  if (data.length > MAX_ENVELOPE) throw new Error('amplop terlalu besar');
  const f = parseFields(data);
  const type = f.get(1)?.at(-1)?.bytes?.toString('utf8') ?? '';
  if (!KNOWN_TYPES.has(type)) throw new Error(`tipe pesan tidak dikenal: ${type}`);
  let body = f.get(2)?.at(-1)?.bytes ?? Buffer.alloc(0);
  const compressed = (f.get(3)?.at(-1)?.num ?? 0) !== 0;
  if (compressed) body = zlib.gunzipSync(body, { maxOutputLength: MAX_PAYLOAD });
  return { type, payload: decodeMessage(SCHEMAS[type], body), requestId: f.get(4)?.at(-1)?.num ?? 0 };
}
