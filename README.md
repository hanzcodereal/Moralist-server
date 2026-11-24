# Server Moralist

Satu proses Node.js tanpa dependensi (butuh Node 22.13 atau lebih baru). Isinya:

- `/` halaman publik: unduhan, isi aplikasi, riwayat versi, kontak
- `/api/releases` dan `/api/releases/latest`: dibaca aplikasi untuk cek pembaruan
- `/download/<versi>` atau `/download/latest`: unduh APK (mendukung Range)
- `/ws`: WebSocket Dengar Bersama (Listen Together), memakai protokol protobuf yang sama dengan aplikasi
- `/listen?code=` dan `/party?r=`: halaman undangan yang dibuka dari tautan bagikan room
- `/admin`: login username dan password, tambah versi, unggah APK atau pakai tautan, terbitkan atau tarik, hapus, ganti password

## Dengar Bersama

Server ini juga menjadi backend Dengar Bersama. Room, anggota, antrean, dan token sesi disimpan di SQLite, jadi anggota bisa tersambung lagi (`reconnect`) setelah server di-restart. Saat server dimatikan (SIGTERM), klien diberi tahu lewat `server_restarting` dan akan menyambung ulang sendiri.

- Aplikasi hanya menerima `wss://`, jadi server **wajib** berada di belakang HTTPS dan meneruskan header Upgrade (Render, Railway, Fly, dan Nginx dengan `proxy_set_header Upgrade` sudah mendukung).
- Butuh proses yang hidup terus. Hosting serverless seperti Vercel tidak bisa menjalankan WebSocket.
- Batas yang bisa diatur lewat env: `LT_MAX_USERS` (20 per room), `LT_MAX_ROOMS` (2000), `LT_GRACE_SEC` (300, waktu tunggu user yang terputus), `LT_HOST_GRACE_SEC` (45, waktu tunggu sebelum host digantikan).
- Uji otomatis: `node --test test/lt.test.js`

## Database

Tidak perlu server database terpisah. Data disimpan di SQLite (`DATA_DIR/moralist.db`): daftar versi dan tautan unduhan APK (yang kamu isi di `/admin` setiap ada update), akun admin, serta room Dengar Bersama. Berkas APK yang diunggah ada di `DATA_DIR/apk/`.
Syaratnya satu: folder `DATA_DIR` harus **persisten**. Hosting yang filesystem-nya hilang tiap deploy (misalnya Vercel) tidak cocok.
Pakai VPS, Render (disk), Railway (volume), atau Fly.io (volume).

## Jalankan

```

# set variabel lingkungan (ADMIN_USER, ADMIN_PASSWORD, PUBLIC_URL, DATA_DIR) di hosting
node src/index.js
```

Tanpa `ADMIN_PASSWORD`, password acak dicetak sekali di log saat server pertama jalan. Dengan `ADMIN_PASSWORD`, nilainya selalu dipakai saat start.

## Deploy ke Railway

1. Push folder ini ke GitHub (`package.json`, `src/`, `Dockerfile`, `railway.json` harus di root repo).
2. Railway: New Project, Deploy from GitHub repo, pilih repo ini. Railway memakai `Dockerfile` otomatis.
3. Tab Variables, isi `ADMIN_USER`, `ADMIN_PASSWORD`, `DATA_DIR=/data`.
4. Tambah Volume dengan Mount Path `/data`. Wajib: database SQLite dan room Dengar Bersama disimpan di sini.
5. Settings, Networking, Generate Domain. Lalu isi variabel `PUBLIC_URL=https://xxxx.up.railway.app` (Railway redeploy sendiri).
6. Buka `/admin`, login, tambah versi dengan "Pakai tautan unduhan yang sudah ada" (link APK dari GitHub Releases).

Tidak perlu database terpisah (Neon/Postgres). Semua data ada di `/data/moralist.db` pada Volume.

## Menghubungkan aplikasi

Jalankan `./set-domain.sh domainmu.com` di root proyek (mengganti domain bawaan di gradle.properties, kode aplikasi, dan `MoralistServer.kt`), lalu build ulang APK. Aplikasi memanggil `<url>/api/releases`, membandingkan versi, lalu mengunduh APK dan memverifikasi ukuran serta SHA-256 yang dihitung server. APK pembaruan harus ditandatangani dengan keystore yang sama dengan APK yang terpasang.

## Rilis pertama

1. Build APK: `./gradlew :androidApp:assembleRelease`
2. Buka `/admin`, tambah versi `2.0.0`, unggah APK, centang Terbitkan.
