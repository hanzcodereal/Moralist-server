// Halaman HTML sisi server. Semua teks dalam bahasa Indonesia.
export const SITE = {
  name: 'Moralist',
  developer: 'Hanz Dev Official',
  email: 'hanzzcodee@gmail.com',
  donate: 'https://saweria.co/hanzreally',
  appVersion: '2.0.0',
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function formatSize(bytes) {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
export const formatDate = (iso) => dateFmt.format(new Date(iso));

const head = (title, desc, extra = '') => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/png" href="/assets/logo.png">
<link rel="stylesheet" href="/assets/home.css">
${extra}
</head>`;

const brandLink = (cls = 'navbar__brand', size = 46) => `<a class="${cls}" href="/" aria-label="Moralist, beranda"><img class="${cls}-mark" src="/assets/logo.png" alt="" width="${size}" height="${size}"><span>Moralist</span></a>`;

// Kerangka halaman dalam (privasi, admin, undangan, 404) dengan desain yang sama seperti beranda.
const innerNav = (links = '<a href="/">Beranda</a>') => `<header class="navbar">
  <div class="container navbar__inner">
    ${brandLink()}
    <nav class="navbar__links navbar__links--always" aria-label="Utama">${links}</nav>
  </div>
</header>`;

const innerPage = ({ title, desc, nav, main, script = '', bodyClass = '' }) => `${head(title, desc)}
<body class="inner ${bodyClass}">
${innerNav(nav)}
<main class="inner__main"><div class="container">${main}</div></main>
${script}
</body></html>`;

const FEATURES = [
  ['Pemutar YouTube Music', 'Cari lagu, album, artis, dan playlist, lalu putar langsung. Mendukung login akun YouTube Music untuk rekomendasi dan pustaka kamu.'],
  ['Pustaka dan mode offline', 'Simpan lagu, album, dan playlist ke pustaka. Lagu yang pernah diputar atau diunduh tetap bisa diputar saat jaringan putus.'],
  ['Lirik tersinkron', 'Lirik berjalan mengikuti lagu, dengan pilihan romanisasi dan terjemahan.'],
  ['MoraEQ', 'Equalizer dengan preset dan profil buatan sendiri yang bisa disimpan.'],
  ['Dengar Bersama', 'Putar lagu yang sama dengan temanmu dalam satu room, tersinkron. Host menyetujui anggota dan antrean, teman bisa menyarankan lagu.'],
  ['Pengenal lagu', 'Kenali lagu yang sedang terdengar di sekitarmu langsung dari aplikasi.'],
  ['Impor playlist', 'Bawa playlist dari Spotify, Apple Music, Deezer, Tidal, dan Amazon Music.'],
  ['Scrobble dan Discord', 'Kirim riwayat putar ke Last.fm dan tampilkan lagu yang kamu putar di Discord.'],
  ['Android Auto, widget, dan timer tidur', 'Kontrol dari mobil dan layar utama, serta matikan pemutaran otomatis saat kamu tertidur.'],
  ['Cast ke speaker', 'Alirkan ke perangkat Google Cast, DLNA, FCast, dan Sonos di jaringan yang sama.'],
  ['Cadangkan dan pulihkan', 'Simpan data aplikasi ke satu berkas dan pulihkan saat pindah ponsel.'],
];

export function homePage({ latest, history, base }) {
  const dl = latest
    ? `<dl class="facts">
         <div><dt>Versi</dt><dd>${esc(latest.version)}</dd></div>
         <div><dt>Ukuran</dt><dd>${esc(formatSize(latest.size))}</dd></div>
         <div><dt>Dirilis</dt><dd>${esc(formatDate(latest.created_at))}</dd></div>
         <div><dt>Android</dt><dd>7.0 ke atas</dd></div>
       </dl>
       <div class="download__actions">
         <a class="btn btn-filled btn-lg" href="/download/${esc(latest.version)}" download>Unduh APK ${esc(latest.version)}</a>
       </div>
       `
    : `<p class="empty">Belum ada rilis. Admin belum menerbitkan berkas APK. Kunjungi lagi nanti, atau hubungi <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`;

  const rows = history.length
    ? history
        .map(
          (r) => `<tr><th scope="row">${esc(r.version)}</th><td>${esc(formatDate(r.created_at))}</td><td>${esc(formatSize(r.size))}</td><td><a href="/download/${esc(r.version)}" download>Unduh</a></td></tr>`,
        )
        .join('')
    : '';

  return `${head('Moralist: pemutar YouTube Music untuk Android', 'Moralist adalah pemutar YouTube Music berbahasa Indonesia untuk Android. Unduh APK resmi dari Hanz Dev Official.')}
<body>
<a class="skip-link" href="#unduh">Lompat ke unduhan</a>
<header class="navbar">
  <div class="container navbar__inner">
    <a class="navbar__brand" href="/" aria-label="Moralist, beranda">
      <img class="navbar__brand-mark" src="/assets/logo.png" alt="" width="46" height="46">
      <span>Moralist</span>
    </a>
    <nav class="navbar__links" aria-label="Utama">
      <a href="#isi">Isi aplikasi</a>
      <a href="#riwayat">Riwayat</a>
      <a href="#kontak">Kontak</a>
      <a class="btn btn-filled btn-sm" href="#unduh">Unduh</a>
    </nav>
  </div>
</header>
<main id="main">
  <section class="hero" aria-labelledby="hero-title">
    <div class="container">
      <div class="hero__layout">
        <div class="hero__copy">
          <h1 id="hero-title">Musik <span>tanpa gangguan</span></h1>
          <p class="hero__lede">Moralist adalah pemutar YouTube Music untuk Android. Seluruh tampilannya berbahasa Indonesia, dari menu sampai pesan galat.</p>
          <div class="hero__actions">
            <a class="btn btn-filled btn-lg" href="#unduh">Unduh APK</a>
            <a class="btn btn-outlined btn-lg" href="#isi">Lihat isi aplikasi</a>
          </div>
        </div>
        <div class="hero__signal">
          <div>
            <strong>Pemutar untuk Android</strong>
            <p>Dibuat untuk pengguna Indonesia, dengan pembaruan langsung dari dalam aplikasi.</p>
          </div>
          <dl class="hero__stats" aria-label="Informasi rilis">
            <div><dt>Versi</dt><dd>${latest ? esc(latest.version) : 'Belum ada'}</dd></div>
            <div><dt>Android</dt><dd>7.0+</dd></div>
            <div><dt>Bahasa</dt><dd>Indonesia</dd></div>
          </dl>
        </div>
      </div>
    </div>
  </section>

  <section id="isi" class="features section-band" aria-labelledby="h-isi">
    <div class="container">
      <header class="features-head">
        <h2 id="h-isi">Isi aplikasi</h2>
      </header>
      <div class="features__grid">
        ${FEATURES.map(([t, d], i) => `<article class="features__card features__card--${(i % 6) + 1}"><div class="features__copy"><h3>${esc(t)}</h3><p>${esc(d)}</p></div></article>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="download" id="unduh" aria-labelledby="h-unduh">
    <div class="container">
      <div class="download__panel">
        <div class="download__copy">
          <h2 id="h-unduh">Unduh <span>Moralist</span></h2>
          <p>APK resmi dari situs ini. Pasang di ponselmu, lalu pembaruan berikutnya bisa diambil dari dalam aplikasi.</p>
        </div>
        <div class="download__details">
          ${dl}
          <ol class="steps">
            <li>Buka berkas APK di ponselmu.</li>
            <li>Jika Android meminta, izinkan pemasangan dari browser atau pengelola berkas yang kamu pakai.</li>
            <li>Pembaruan berikutnya bisa diambil dari dalam aplikasi, menu Pengaturan lalu Pembaruan.</li>
          </ol>
        </div>
      </div>
    </div>
  </section>

  <section class="history section-band" id="riwayat" aria-labelledby="h-riwayat">
    <div class="container">
      <h2 id="h-riwayat">Riwayat versi</h2>
      ${
        rows
          ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Tabel riwayat versi"><table><thead><tr><th scope="col">Versi</th><th scope="col">Tanggal</th><th scope="col">Ukuran</th><th scope="col"><span class="sr-only">Unduh</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : '<p class="empty">Belum ada versi yang diterbitkan.</p>'
      }
    </div>
  </section>

  <section class="contact" id="kontak" aria-labelledby="h-kontak">
    <div class="container">
      <div class="contact__panel">
        <h2 id="h-kontak">Kontak</h2>
        <p class="who">${esc(SITE.developer)}</p>
        <p><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></p>
        <p><a class="btn btn-outlined" href="${esc(SITE.donate)}" rel="noopener">Belikan saya kopi</a></p>
      </div>
    </div>
  </section>
</main>
<footer class="footer">
  <div class="container">
    <div class="footer__top">
      <a class="footer__brand" href="/" aria-label="Moralist, beranda">
        <img src="/assets/logo.png" alt="" width="44" height="44" loading="lazy">
        <strong>Moralist</strong>
      </a>
      <p class="footer__disclaimer">Moralist bukan produk resmi YouTube atau Google.</p>
    </div>
    <nav class="footer__links" aria-label="Footer">
      <a href="#unduh">Unduh</a>
      <a href="#isi">Isi aplikasi</a>
      <a href="/privacy">Privasi</a>
    </nav>
  </div>
</footer>
<script src="/assets/site.js" defer></script>
</body></html>`;
}

export function privacyPage() {
  return innerPage({
    title: 'Privasi: Moralist',
    desc: 'Data apa yang dikumpulkan server Moralist.',
    main: `<article class="panel-card prose">
  <h1>Privasi</h1>
  <p>Halaman ini menjelaskan apa yang dicatat oleh server Moralist, yaitu server yang melayani situs ini dan pengecekan pembaruan aplikasi.</p>
  <h2>Yang dicatat server</h2>
  <p>Server menghitung berapa kali tiap versi APK diunduh. Seperti server web pada umumnya, alamat IP dan permintaan dapat tercatat di log hosting yang kamu pakai untuk menjalankan server ini. Server tidak meminta akun atau data pribadi dari pengunjung.</p>
  <h2>Dengar Bersama</h2>
  <p>Saat kamu memakai fitur Dengar Bersama, server menyimpan nama pengguna yang kamu isi, kode room, daftar anggota, lagu yang sedang diputar beserta antreannya, dan token sesi supaya kamu bisa tersambung lagi. Data itu disimpan di database server selama room masih ada, lalu dihapus saat room ditutup atau semua anggotanya keluar.</p>
  <h2>Yang dilakukan aplikasi</h2>
  <p>Saat cek pembaruan, aplikasi meminta daftar versi dari server ini. Pemutaran musik, pencarian, dan login akun berjalan langsung antara aplikasi dan YouTube Music, tidak melewati server ini.</p>
  <h2>Kontak</h2>
  <p>Pertanyaan bisa dikirim ke <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>
</article>`,
  });
}

export const notFoundPage = () => innerPage({
  title: 'Tidak ditemukan: Moralist',
  desc: 'Halaman tidak ditemukan.',
  main: '<article class="panel-card prose"><h1>Halaman tidak ditemukan</h1><p>Alamat yang kamu buka tidak ada. <a href="/">Kembali ke beranda</a>.</p></article>',
});

export function adminLoginPage(error = '') {
  return innerPage({
    title: 'Masuk admin: Moralist',
    desc: 'Panel admin Moralist.',
    bodyClass: 'admin',
    nav: '<a href="/">Beranda</a>',
    main: `<section class="panel-card login">
  <h1>Masuk admin</h1>
  <form method="post" action="/admin/login" autocomplete="on">
    ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
    <label for="u">Username</label>
    <input id="u" name="username" type="text" autocomplete="username" required autofocus>
    <label for="p">Password</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required>
    <button class="btn btn-filled btn-lg" type="submit">Masuk</button>
  </form>
</section>`,
  });
}

export function adminPage(username) {
  return innerPage({
    title: 'Admin: Moralist',
    desc: 'Kelola versi dan tautan unduhan Moralist.',
    bodyClass: 'admin',
    nav: `<span class="who-in">${esc(username)}</span>
      <form method="post" action="/admin/logout" class="inline"><button class="link" type="submit">Keluar</button></form>`,
    main: `<div class="panel" id="app" data-user="${esc(username)}">
  <h1>Kelola versi</h1>
  <p class="note" id="status" role="status"></p>

  <section class="panel-card" aria-labelledby="h-add">
    <h2 id="h-add">Tambah versi</h2>
    <form id="add-form" class="stack">
      <label for="f-version">Nomor versi</label>
      <input id="f-version" name="version" inputmode="numeric" pattern="\\d+\\.\\d+\\.\\d+" placeholder="1.0.0" required>
      <fieldset>
        <legend>Sumber APK</legend>
        <label class="choice"><input type="radio" name="source" value="upload" checked> Unggah berkas APK ke server</label>
        <label class="choice"><input type="radio" name="source" value="external"> Pakai tautan unduhan yang sudah ada</label>
      </fieldset>
      <div id="src-upload">
        <label for="f-file">Berkas APK</label>
        <input id="f-file" name="file" type="file" accept=".apk,application/vnd.android.package-archive">
      </div>
      <div id="src-external" hidden>
        <label for="f-url">Tautan unduhan (https)</label>
        <input id="f-url" name="url" type="url" placeholder="https://contoh.com/moralist-2.0.0.apk">
      </div>
      <label class="choice"><input type="checkbox" name="published" checked> Terbitkan sekarang</label>
      <progress id="progress" max="100" value="0" hidden></progress>
      <button class="btn btn-filled" type="submit" id="add-btn">Simpan versi</button>
    </form>
  </section>

  <section class="panel-card" aria-labelledby="h-list">
    <h2 id="h-list">Daftar versi</h2>
    <p class="empty" id="loading">Memuat…</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Daftar versi" id="list-wrap" hidden>
      <table><thead><tr><th scope="col">Versi</th><th scope="col">Sumber</th><th scope="col">Ukuran</th><th scope="col">Unduhan</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody id="list"></tbody></table>
    </div>
    <p class="empty" id="empty" hidden>Belum ada versi. Tambahkan yang pertama di atas.</p>
  </section>

  <section class="panel-card" aria-labelledby="h-pw">
    <h2 id="h-pw">Ganti password</h2>
    <form id="pw-form" class="stack">
      <label for="pw-new">Password baru (minimal 10 karakter)</label>
      <input id="pw-new" type="password" autocomplete="new-password" minlength="10" required>
      <button class="btn btn-tonal" type="submit">Ganti password</button>
    </form>
  </section>
</div>`,
    script: '<script src="/assets/admin.js" defer></script>',
  });
}

export function invitePage(code, active = false) {
  const safe = String(code || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  let body;
  if (!safe) {
    body = '<p>Link undangan ini tidak memuat kode room.</p>';
  } else if (!active) {
    body = '<p class="invite-gone">Room sudah tidak ada.</p><p>Kode room ini sudah tidak aktif. Minta teman untuk membuat room baru.</p>';
  } else {
    body = `<p>Kode room kamu:</p>
  <p class="invite-code" id="room-code-text" aria-label="Kode room">${esc(safe)}</p>
  <p><button class="btn btn-filled btn-lg" id="copy-room-code" data-target="room-code-text" type="button">Salin kode</button></p>
  <p id="room-copy-status" role="status"></p>`;
  }
  return innerPage({
    title: 'Undangan Dengar Bersama: Moralist',
    desc: 'Gabung ke room Dengar Bersama di Moralist.',
    main: `<article class="panel-card prose">
  <h1>Undangan Dengar Bersama</h1>
  ${body}
  <p>Buka Moralist, masuk ke menu Dengar Bersama, lalu pilih Gabung dan masukkan kode di atas. Belum punya aplikasinya? <a href="/#unduh">Unduh Moralist</a>.</p>
</article>`,
    script: '<script src="/assets/site.js" defer></script>',
  });
}
