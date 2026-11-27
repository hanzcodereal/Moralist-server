import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encode, decode } from '../src/lt/proto.js';

const PORT = 4100 + Math.floor(Math.random() * 500);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mor-lt-'));
let proc;
const startServer = () =>
  new Promise((resolve) => {
    proc = spawn(process.execPath, ['src/index.js'], { env: { ...process.env, PORT, DATA_DIR: dataDir, ADMIN_PASSWORD: 'x'.repeat(12), LT_GRACE_SEC: '2', LT_HOST_GRACE_SEC: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
    proc.stdout.on('data', (d) => String(d).includes('berjalan di port') && resolve());
  });
const stopServer = () => new Promise((resolve) => { proc.once('exit', resolve); proc.kill('SIGTERM'); });

class Client {
  constructor() { this.inbox = []; this.waiters = []; }
  async open(features = []) {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onmessage = (e) => {
      const m = decode(Buffer.from(e.data));
      const i = this.waiters.findIndex((w) => w.type === m.type);
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m.payload);
      else this.inbox.push(m);
    };
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.send('client_capabilities', { supports_protobuf: true, supports_compression: true, client_version: '2.0.0', features });
    return this.expect('server_capabilities');
  }
  send(type, payload) { this.ws.send(encode(type, payload)); }
  expect(type, ms = 3000) {
    const i = this.inbox.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0].payload);
    return new Promise((resolve, reject) => {
      const w = { type, resolve };
      this.waiters.push(w);
      setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); reject(new Error(`timeout menunggu ${type}`)); }, ms);
    });
  }
  close() { this.ws.close(); }
}
const track = (id, n = id) => ({ id, title: `Lagu ${n}`, artist: 'Artis', album: 'Album', duration: 180000, thumbnail: 'https://x/y.jpg' });

test('alur lengkap Dengar Bersama', async () => {
  await startServer();
  const host = new Client();
  const caps = await host.open();
  assert.equal(caps.supports_protobuf, true);
  assert.equal(caps.can_host, true);

  host.send('create_room', { username: 'Hanz' });
  const created = await host.expect('room_created');
  assert.match(created.room_code, /^[A-Z0-9]{8}$/);

  // ping/pong
  host.send('ping', { client_time: 1234, sequence: 1 });
  const pong = await host.expect('pong');
  assert.equal(pong.client_time, 1234);
  assert.ok(pong.server_send_time >= pong.server_receive_time);

  // tamu bergabung, host menyetujui
  const guest = new Client();
  await guest.open();
  guest.send('join_room', { room_code: created.room_code.toLowerCase(), username: 'Budi' });
  const req = await host.expect('join_request');
  assert.equal(req.username, 'Budi');
  host.send('approve_join', { user_id: req.user_id });
  const approved = await guest.expect('join_approved');
  assert.equal(approved.room_code, created.room_code);
  assert.equal(approved.state.host_id, created.user_id);
  assert.equal(approved.state.users.length, 2);
  const joined = await host.expect('user_joined');
  assert.equal(joined.username, 'Budi');

  // pengguna ditolak
  const stranger = new Client();
  await stranger.open();
  stranger.send('join_room', { room_code: created.room_code, username: 'Budi' });
  assert.equal((await stranger.expect('error')).code, 'username_taken');
  stranger.send('join_room', { room_code: 'ZZZZZZ', username: 'Ani' });
  assert.equal((await stranger.expect('error')).code, 'room_not_found');
  stranger.send('join_room', { room_code: created.room_code, username: 'Ani' });
  const req2 = await host.expect('join_request');
  host.send('reject_join', { user_id: req2.user_id });
  assert.equal((await stranger.expect('join_rejected')).reason, 'rejected_by_host');

  // ganti lagu: barrier buffer
  host.send('playback_action', { action: 'change_track', track_id: 't1', position: 0, track_info: track('t1'), replace_queue: true, queue: [track('t2'), track('t3')], queue_title: 'Daftar' });
  const change = await guest.expect('sync_playback');
  assert.equal(change.action, 'change_track');
  assert.equal(change.track_info.id, 't1');
  assert.equal(change.queue.length, 2);
  assert.equal(change.origin_user_id, created.user_id);
  assert.ok(change.server_time > 0);
  const wait = await guest.expect('buffer_wait');
  assert.deepEqual(wait.waiting_for, [approved.user_id]);
  guest.send('buffer_ready', { track_id: 't1' });
  assert.equal((await guest.expect('buffer_complete')).track_id, 't1');

  // play, seek, volume
  host.send('playback_action', { action: 'play', track_id: 't1', position: 5000, captured_at_server_time: Date.now() });
  const play = await guest.expect('sync_playback');
  assert.equal(play.action, 'play');
  assert.equal(play.position, 5000);
  host.send('playback_action', { action: 'set_volume', volume: 0.5 });
  assert.equal((await guest.expect('sync_playback')).volume, 0.5);

  // tamu tidak boleh mengendalikan
  guest.send('playback_action', { action: 'pause', position: 1 });
  assert.equal((await guest.expect('error')).code, 'not_host');

  // sinkronisasi ulang
  guest.send('request_sync', {});
  const sync = await guest.expect('sync_state');
  assert.equal(sync.current_track.id, 't1');
  assert.equal(sync.is_playing, true);
  assert.equal(sync.queue.length, 2);

  // saran lagu
  guest.send('suggest_track', { track_info: track('s1') });
  const submitted = await guest.expect('suggestion_submitted');
  const received = await host.expect('suggestion_received');
  assert.equal(received.from_username, 'Budi');
  assert.equal(received.track_info.suggested_by, 'Budi');
  host.send('approve_suggestion', { suggestion_id: received.suggestion_id });
  assert.equal((await guest.expect('suggestion_approved')).suggestion_id, submitted.suggestion_id);
  const hostQueueAdd = await host.expect('sync_playback');
  assert.equal(hostQueueAdd.action, 'queue_add');
  const guestQueueAdd = await guest.expect('sync_playback');
  assert.equal(guestQueueAdd.track_info.id, 's1');

  // putus lalu sambung kembali dengan token sesi
  guest.close();
  const disc = await host.expect('user_disconnected');
  assert.equal(disc.username, 'Budi');
  const guest2 = new Client();
  await guest2.open();
  guest2.send('reconnect', { session_token: approved.session_token });
  const re = await guest2.expect('reconnected');
  assert.equal(re.user_id, approved.user_id);
  assert.equal(re.is_host, false);
  assert.equal(re.state.queue.length, 3);
  assert.equal((await host.expect('user_reconnected')).username, 'Budi');
  const bad = new Client();
  await bad.open();
  bad.send('reconnect', { session_token: 'tidak-ada' });
  assert.equal((await bad.expect('error')).code, 'session_not_found');

  // transfer host
  host.send('transfer_host', { new_host_id: approved.user_id });
  const changed = await guest2.expect('host_changed');
  assert.equal(changed.new_host_name, 'Budi');

  // server restart: room dan sesi tetap ada
  assert.ok(await host.expect('host_changed'));
  const restartNotice = guest2.expect('server_restarting');
  await stopServer();
  assert.equal((await restartNotice).eta_ms, 5000);
  await startServer();
  const back = new Client();
  await back.open();
  back.send('reconnect', { session_token: approved.session_token });
  const restored = await back.expect('reconnected');
  assert.equal(restored.room_code, created.room_code);
  assert.equal(restored.is_host, true);
  assert.equal(restored.state.current_track.id, 't1');
  assert.equal(restored.state.queue.length, 3);
  assert.equal(restored.state.users.length, 2);

  // keluar: host yang keluar menutup room untuk semua anggota
  back.send('leave_room', {});
  await new Promise((r) => setTimeout(r, 300));
  const health = await (await fetch(`http://localhost:${PORT}/api/health`)).json();
  assert.equal(health.listenTogether.rooms, 0);
  await stopServer();
});

test('kick dan pergantian host otomatis', async () => {
  await startServer();
  const host = new Client(); await host.open();
  host.send('create_room', { username: 'Host' });
  const created = await host.expect('room_created');
  const join = async (name) => {
    const c = new Client(); await c.open();
    c.send('join_room', { room_code: created.room_code, username: name });
    host.send('approve_join', { user_id: (await host.expect('join_request')).user_id });
    return { c, info: await c.expect('join_approved') };
  };
  const a = await join('A');
  const b = await join('B');
  host.send('kick_user', { user_id: b.info.user_id, reason: 'uji' });
  assert.equal((await b.c.expect('kicked')).reason, 'uji');
  assert.equal((await a.c.expect('user_left')).username, 'B');
  // host menghilang dan tidak kembali: setelah masa tunggu habis, room ditutup untuk anggota
  host.close();
  assert.equal((await a.c.expect('user_disconnected', 4000)).username, 'Host');
  assert.equal((await a.c.expect('kicked', 4000)).reason, 'room_closed');
  await stopServer();
});

test('join saat host offline menunggu host kembali', async () => {
  await startServer();
  const host = new Client(); await host.open();
  host.send('create_room', { username: 'Host' });
  const created = await host.expect('room_created');
  host.close();
  const guest = new Client(); await guest.open();
  guest.send('join_room', { room_code: created.room_code, username: 'Tamu' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(guest.inbox.some((m) => m.type === 'error'), false);
  const back = new Client(); await back.open();
  back.send('reconnect', { session_token: created.session_token });
  await back.expect('reconnected');
  const req = await back.expect('join_request');
  assert.equal(req.username, 'Tamu');
  back.send('approve_join', { user_id: req.user_id });
  assert.equal((await guest.expect('join_approved')).room_code, created.room_code);
  await stopServer();
});

test('halaman undangan: kode dan tombol salin saat aktif, pesan saat room sudah tutup', async () => {
  await startServer();
  const host = new Client(); await host.open();
  host.send('create_room', { username: 'Host' });
  const created = await host.expect('room_created');
  const base = `http://localhost:${PORT}/listen?code=${created.room_code}`;
  const active = await (await fetch(base)).text();
  assert.match(active, /id="copy-room-code"/);
  assert.ok(active.includes(created.room_code));
  host.send('leave_room', {});
  await new Promise((r) => setTimeout(r, 200));
  const gone = await (await fetch(base)).text();
  assert.match(gone, /Room sudah tidak ada/);
  assert.equal(gone.includes(created.room_code), false);
  assert.equal(gone.includes('copy-room-code'), false);
  await stopServer();
});

test.after(() => { try { proc.kill('SIGKILL'); } catch { /* sudah berhenti */ } fs.rmSync(dataDir, { recursive: true, force: true }); });

test('obrolan room: riwayat tersimpan, hanya untuk aplikasi yang mendukung', async () => {
  await startServer();
  const host = new Client();
  const caps = await host.open(['chat']);
  assert.ok(caps.features.includes('chat'));
  host.send('create_room', { username: 'Hanz' });
  const created = await host.expect('room_created');

  const join = async (name, features) => {
    const c = new Client();
    await c.open(features);
    c.send('join_room', { room_code: created.room_code, username: name });
    const req = await host.expect('join_request');
    host.send('approve_join', { user_id: req.user_id });
    await c.expect('join_approved');
    return c;
  };
  const guest = await join('Budi', ['chat']);
  const legacy = await join('Lama', []);

  guest.send('send_chat', { text: '  halo semua 👋  ' });
  const a = await host.expect('chat_message');
  const b = await guest.expect('chat_message');
  assert.equal(a.text, 'halo semua 👋');
  assert.equal(a.username, 'Budi');
  assert.equal(b.message_id, a.message_id);
  host.send('send_chat', { text: 'selamat datang' });
  await guest.expect('chat_message');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(legacy.inbox.some((m) => m.type.startsWith('chat_')), false, 'aplikasi lama tidak boleh menerima pesan obrolan');

  // anggota baru melihat riwayat
  const late = await join('Siti', ['chat']);
  const hist = await late.expect('chat_history');
  assert.deepEqual(hist.messages.map((m) => m.text), ['halo semua 👋', 'selamat datang']);

  // pesan kosong diabaikan, pembatas laju bekerja
  guest.send('send_chat', { text: '   ' });
  for (let i = 0; i < 8; i++) guest.send('send_chat', { text: `spam ${i}` });
  const err = await guest.expect('error');
  assert.equal(err.code, 'chat_rate_limited');

  [host, guest, legacy, late].forEach((c) => c.close());
  await stopServer();
});
