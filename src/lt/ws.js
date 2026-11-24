// WebSocket server minimal (RFC 6455) tanpa dependensi. Hanya bingkai biner dan kontrol yang dipakai Dengar Bersama.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 512 * 1024;

export class WsConn extends EventEmitter {
  constructor(socket, ip) {
    super();
    this.socket = socket;
    this.ip = ip;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = 0;
    this.closed = false;
    this.lastSeen = Date.now();
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.#onData(chunk));
    socket.on('close', () => this.#finish());
    socket.on('error', () => this.#finish());
    this.pinger = setInterval(() => {
      if (Date.now() - this.lastSeen > 70_000) return this.terminate();
      this.#frame(0x9, Buffer.alloc(0));
    }, 25_000);
    this.pinger.unref();
  }

  #finish() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    this.emit('close');
  }

  #onData(chunk) {
    this.lastSeen = Date.now();
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    try {
      while (this.#parseFrame());
    } catch {
      this.close(1002, 'protocol error');
    }
  }

  #parseFrame() {
    const b = this.buffer;
    if (b.length < 2) return false;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (b.length < 4) return false;
      len = b.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (b.length < 10) return false;
      const big = b.readBigUInt64BE(2);
      if (big > BigInt(MAX_MESSAGE)) throw new Error('bingkai terlalu besar');
      len = Number(big);
      offset = 10;
    }
    if (!masked) throw new Error('klien harus memakai mask');
    if (len > MAX_MESSAGE) throw new Error('bingkai terlalu besar');
    if (b.length < offset + 4 + len) return false;
    const mask = b.subarray(offset, offset + 4);
    const payload = Buffer.from(b.subarray(offset + 4, offset + 4 + len));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    this.buffer = b.subarray(offset + 4 + len);

    if (opcode >= 0x8) {
      if (!fin || len > 125) throw new Error('bingkai kontrol tidak valid');
      if (opcode === 0x8) this.close(1000, '');
      else if (opcode === 0x9) this.#frame(0xa, payload);
      return true;
    }
    if (opcode === 0x1 || opcode === 0x2) {
      if (this.fragments.length) throw new Error('fragmen baru sebelum selesai');
      this.fragmentOpcode = opcode;
    } else if (opcode !== 0x0 || !this.fragments.length) {
      throw new Error('opcode tidak valid');
    }
    this.fragments.push(payload);
    if (this.fragments.reduce((n, p) => n + p.length, 0) > MAX_MESSAGE) throw new Error('pesan terlalu besar');
    if (fin) {
      const message = Buffer.concat(this.fragments);
      const opcodeDone = this.fragmentOpcode;
      this.fragments = [];
      this.emit('message', message, opcodeDone === 0x1);
    }
    return true;
  }

  #frame(opcode, payload) {
    if (this.closed || this.socket.destroyed) return false;
    let header;
    if (payload.length < 126) header = Buffer.from([0x80 | opcode, payload.length]);
    else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
    return this.socket.write(Buffer.concat([header, payload]));
  }

  sendBinary(buf) { return this.#frame(0x2, buf); }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const r = Buffer.from(reason);
    const payload = Buffer.alloc(2 + r.length);
    payload.writeUInt16BE(code, 0);
    r.copy(payload, 2);
    this.#frame(0x8, payload);
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref();
  }

  terminate() { this.socket.destroy(); }
}

/** Menyelesaikan handshake upgrade dan mengembalikan WsConn, atau null bila permintaan ditolak. */
export function acceptUpgrade(req, socket, ip) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return new WsConn(socket, ip);
}
