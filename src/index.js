import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { db, APK_DIR, isVersion, listReleases, publishedReleases, getRelease } from './db.js';
import * as auth from './auth.js';
import { acceptUpgrade } from './lt/ws.js';
import * as lt from './lt/rooms.js';
import { invitePage, homePage, privacyPage, notFoundPage, adminLoginPage, adminPage } from './pages.js';

const PORT = Number(process.env.PORT || 3000);
const MAX_APK_BYTES = Number(process.env.MAX_APK_MB || 300) * 1024 * 1024;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const baseUrl = (req) => {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto']?.split(',')[0] || 'http';
  return `${proto}://${req.headers.host}`;
};
const isSecure = (req) => baseUrl(req).startsWith('https://');
const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}
const html = (res, status, body, extra = {}) => send(res, status, body, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra });
const json = (res, status, data, extra = {}) =>
  send(res, status, JSON.stringify(data), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });
const redirect = (res, location, extra = {}) => send(res, 303, '', { location, ...extra });

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Body terlalu besar'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
const readJson = async (req) => {
  try {
    return JSON.parse((await readBody(req)) || '{}');
  } catch (e) {
    throw Object.assign(new Error(e.status === 413 ? e.message : 'JSON tidak valid'), { status: e.status || 400 });
  }
};

const cookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((p) => p.trim().split('='))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k, v.join('=')]),
  );
const sessionCookie = (req, token, maxAge) =>
  `${auth.COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;
const isAdmin = (req) => auth.sessionValid(cookies(req)[auth.COOKIE]);

const apkName = (version) => `moralist-android-${version}.apk`;
const apkPath = (version) => path.join(APK_DIR, apkName(version));

function releaseToGithubShape(r, base) {
  return {
    tag_name: `v${r.version}`,
    name: `Moralist ${r.version}`,
    body: '',
    draft: false,
    prerelease: false,
    published_at: r.created_at,
    html_url: base,
    assets: [
      {
        name: apkName(r.version),
        state: 'uploaded',
        size: r.size,
        digest: `sha256:${r.sha256}`,
        browser_download_url: `${base}/download/${r.version}`,
      },
    ],
  };
}

const publicRelease = (r) => ({
  id: r.id, version: r.version, source: r.source, size: r.size, sha256: r.sha256,
  published: Boolean(r.published), downloads: r.downloads, createdAt: r.created_at, hasFile: r.source !== 'none' && Boolean(r.sha256),
});

class HashLimit extends Transform {
  constructor(limit) {
    super();
    this.limit = limit;
    this.size = 0;
    this.hash = crypto.createHash('sha256');
    this.first = Buffer.alloc(0);
  }
  _transform(chunk, _enc, cb) {
    this.size += chunk.length;
    if (this.size > this.limit) return cb(Object.assign(new Error('Berkas melebihi batas ukuran'), { status: 413 }));
    if (this.first.length < 2) this.first = Buffer.concat([this.first, chunk]).subarray(0, 2);
    this.hash.update(chunk);
    cb(null, chunk);
  }
}
const looksLikeApk = (t) => t.first.length === 2 && t.first[0] === 0x50 && t.first[1] === 0x4b; // "PK"

async function storeStream(readable, version) {
  const tmp = path.join(APK_DIR, `tmp-${crypto.randomBytes(6).toString('hex')}`);
  const meter = new HashLimit(MAX_APK_BYTES);
  try {
    await pipeline(readable, meter, fs.createWriteStream(tmp));
    if (!looksLikeApk(meter)) throw Object.assign(new Error('Berkas bukan APK yang valid'), { status: 400 });
    fs.renameSync(tmp, apkPath(version));
    return { size: meter.size, sha256: meter.hash.digest('hex') };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

async function hashExternal(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok || !res.body) throw Object.assign(new Error(`Tautan mengembalikan status ${res.status}`), { status: 400 });
  const meter = new HashLimit(MAX_APK_BYTES);
  await pipeline(Readable.fromWeb(res.body), meter, new (class extends Transform { _transform(_c, _e, cb) { cb(); } })());
  if (!looksLikeApk(meter)) throw Object.assign(new Error('Tautan tidak mengarah ke berkas APK'), { status: 400 });
  return { size: meter.size, sha256: meter.hash.digest('hex') };
}

function serveFile(req, res, file, name) {
  const stat = fs.statSync(file);
  const headers = {
    ...SECURITY,
    'content-type': 'application/vnd.android.package-archive',
    'content-disposition': `attachment; filename="${name}"`,
    'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(stat.size - Number(range[2]), 0);
    }
    if (start > end || start >= stat.size) {
      res.writeHead(416, { ...SECURITY, 'content-range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['content-range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['content-length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}

function handleDownload(req, res, versionParam) {
  const list = publishedReleases();
  const wanted = versionParam.replace(/\.apk$/, '');
  const release = wanted === '' || wanted === 'latest' ? list[0] : list.find((r) => r.version === wanted);
  if (!release) return html(res, 404, notFoundPage());
  const fromStart = !req.headers.range || /^bytes=0-/.test(req.headers.range);
  if (req.method === 'GET' && fromStart) db.prepare('UPDATE releases SET downloads = downloads + 1 WHERE id = ?').run(release.id);
  if (release.source === 'external') return send(res, 302, '', { location: release.external_url, 'cache-control': 'no-store' });
  const file = apkPath(release.version);
  if (!fs.existsSync(file)) return html(res, 404, notFoundPage());
  return serveFile(req, res, file, apkName(release.version));
}

function serveStatic(req, res, rel) {
  const file = path.normalize(path.join(PUBLIC_DIR, 'assets', rel));
  if (!file.startsWith(path.join(PUBLIC_DIR, 'assets') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return html(res, 404, notFoundPage());
  }
  send(res, 200, fs.readFileSync(file), { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
}

async function adminApi(req, res, url) {
  if (!isAdmin(req)) return json(res, 401, { error: 'Belum masuk' });
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'moralist') return json(res, 403, { error: 'Permintaan ditolak' });
  const parts = url.pathname.split('/').filter(Boolean).slice(2); // setelah /admin/api
  const [resource, version, action] = parts;

  if (resource === 'password' && req.method === 'POST') {
    const { password } = await readJson(req);
    if (typeof password !== 'string' || password.length < 10) return json(res, 400, { error: 'Password minimal 10 karakter' });
    auth.changePassword(password);
    auth.destroyAllSessions();
    return json(res, 200, { ok: true, relogin: true }, { 'set-cookie': sessionCookie(req, '', 0) });
  }
  if (resource !== 'releases') return json(res, 404, { error: 'Tidak ditemukan' });

  if (!version) {
    if (req.method === 'GET') return json(res, 200, listReleases().map(publicRelease));
    if (req.method === 'POST') {
      const body = await readJson(req);
      if (!isVersion(body.version)) return json(res, 400, { error: 'Nomor versi harus berformat 2.0.0' });
      if (getRelease(body.version)) return json(res, 409, { error: 'Versi itu sudah ada' });
      let meta = { size: null, sha256: null };
      let source = 'upload';
      let externalUrl = null;
      if (body.source === 'external') {
        let u;
        try { u = new URL(body.url); } catch { return json(res, 400, { error: 'Tautan tidak valid' }); }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return json(res, 400, { error: 'Tautan harus http atau https' });
        meta = await hashExternal(u.href);
        source = 'external';
        externalUrl = u.href;
      }
      db.prepare('INSERT INTO releases(version, source, external_url, size, sha256, published) VALUES(?,?,?,?,?,?)').run(
        body.version, source === 'external' ? 'external' : 'none', externalUrl, meta.size, meta.sha256, body.published && source === 'external' ? 1 : 0,
      );
      return json(res, 201, publicRelease(getRelease(body.version)));
    }
  } else {
    const release = getRelease(version);
    if (!release) return json(res, 404, { error: 'Versi tidak ditemukan' });
    if (action === 'apk' && req.method === 'PUT') {
      const meta = await storeStream(req, version);
      db.prepare("UPDATE releases SET source = 'upload', external_url = NULL, size = ?, sha256 = ?, file_name = ? WHERE id = ?").run(meta.size, meta.sha256, apkName(version), release.id);
      return json(res, 200, publicRelease(getRelease(version)));
    }
    if (!action && req.method === 'PATCH') {
      const body = await readJson(req);
      if (body.published && (release.source === 'none' || !release.sha256)) return json(res, 400, { error: 'Tambahkan berkas atau tautan APK dulu' });
      db.prepare('UPDATE releases SET published = ? WHERE id = ?').run(body.published ? 1 : 0, release.id);
      return json(res, 200, publicRelease(getRelease(version)));
    }
    if (!action && req.method === 'DELETE') {
      fs.rmSync(apkPath(version), { force: true });
      db.prepare('DELETE FROM releases WHERE id = ?').run(release.id);
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 405, { error: 'Metode tidak didukung' });
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const method = req.method;

  if (p === '/' && method === 'GET') {
    const list = publishedReleases();
    return html(res, 200, homePage({ latest: list[0] || null, history: list, base: baseUrl(req) }));
  }
  if (p === '/listen' || p === '/party') {
    const code = String(url.searchParams.get('code') || url.searchParams.get('r') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
    return html(res, 200, invitePage(code, lt.roomExists(code)));
  }
  if (p === '/privacy') return html(res, 200, privacyPage());
  if (p.startsWith('/assets/')) return serveStatic(req, res, p.slice('/assets/'.length));
  if (p === '/api/health') return json(res, 200, { ok: true, listenTogether: lt.stats() });
  if (p === '/api/releases') return json(res, 200, publishedReleases().map((r) => releaseToGithubShape(r, baseUrl(req))), { 'cache-control': 'public, max-age=60' });
  if (p === '/api/releases/latest') {
    const latest = publishedReleases()[0];
    return latest ? json(res, 200, releaseToGithubShape(latest, baseUrl(req))) : json(res, 404, { error: 'Belum ada rilis' });
  }
  if ((method === 'GET' || method === 'HEAD') && (p === '/download' || p.startsWith('/download/'))) return handleDownload(req, res, p.slice('/download'.length).replace(/^\//, ''));

  if (p === '/admin' || p === '/admin/') {
    return isAdmin(req) ? html(res, 200, adminPage(auth.adminUsername())) : html(res, 200, adminLoginPage());
  }
  if (p === '/admin/login' && method === 'POST') {
    const ip = clientIp(req);
    if (!auth.loginAllowed(ip)) return html(res, 429, adminLoginPage('Terlalu banyak percobaan. Coba lagi dalam 15 menit.'));
    const form = new URLSearchParams(await readBody(req));
    if (!auth.checkLogin(form.get('username') ?? '', form.get('password') ?? '')) {
      auth.recordLoginFailure(ip);
      return html(res, 401, adminLoginPage('Username atau password salah.'));
    }
    auth.clearLoginFailures(ip);
    const { token, maxAge } = auth.createSession();
    return redirect(res, '/admin', { 'set-cookie': sessionCookie(req, token, maxAge) });
  }
  if (p === '/admin/logout' && method === 'POST') {
    auth.destroySession(cookies(req)[auth.COOKIE]);
    return redirect(res, '/admin', { 'set-cookie': sessionCookie(req, '', 0) });
  }
  if (p.startsWith('/admin/api/')) return adminApi(req, res, url);

  return html(res, 404, notFoundPage());
}

auth.seedAdmin();
console.log(`Dengar Bersama: ${lt.loadRooms()} room dipulihkan dari database`);
const wsPerIp = new Map();
const server = http
  .createServer((req, res) => {
    route(req, res).catch((e) => {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      if (res.headersSent) return res.destroy();
      const message = status === 500 ? 'Terjadi kesalahan di server' : e.message;
      if (req.url.startsWith('/admin/api/')) json(res, status, { error: message });
      else html(res, status, `<p>${message}</p>`);
    });
  })
  ;
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') return socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  const ip = clientIp(req);
  if ((wsPerIp.get(ip) || 0) >= 20) return socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
  const conn = acceptUpgrade(req, socket, ip);
  if (!conn) return;
  wsPerIp.set(ip, (wsPerIp.get(ip) || 0) + 1);
  conn.on('close', () => wsPerIp.set(ip, Math.max((wsPerIp.get(ip) || 1) - 1, 0)));
  lt.handleConnection(conn);
});
server.listen(PORT, () => console.log(`Moralist server berjalan di port ${PORT}`));

function shutdown() {
  console.log('Server berhenti, menyimpan room…');
  lt.announceRestart(5000);
  lt.flushAll();
  setTimeout(() => process.exit(0), 400).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
