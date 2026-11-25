// Tombol salin kode room di halaman undangan Dengar Bersama.
const roomCopy = document.getElementById('copy-room-code');
if (roomCopy) {
  const roomStatus = document.getElementById('room-copy-status');
  roomCopy.addEventListener('click', async () => {
    const value = document.getElementById(roomCopy.dataset.target).textContent.trim();
    try {
      await navigator.clipboard.writeText(value);
      roomStatus.textContent = 'Kode room disalin.';
    } catch {
      roomStatus.textContent = 'Gagal menyalin otomatis. Tekan lama kodenya lalu pilih Salin.';
    }
  });
}

// Galeri screenshot: scroll-snap, item aktif di tengah, titik penunjuk, tombol sebelumnya/berikutnya.
(() => {
  const gallery = document.getElementById('gallery');
  if (!gallery) return;
  const items = Array.from(gallery.children);
  const dots = document.getElementById('gallery-dots');
  const step = () => items[0].offsetWidth + 24;
  const center = (i) => items[i].offsetLeft - (gallery.clientWidth - items[i].offsetWidth) / 2;
  items.forEach(() => dots.appendChild(document.createElement('span')));

  const update = () => {
    const mid0 = gallery.scrollLeft + gallery.clientWidth / 2;
    let active = 0;
    let best = Infinity;
    items.forEach((item, i) => {
      const dist = Math.abs(mid0 - (item.offsetLeft + item.offsetWidth / 2));
      item.style.setProperty('--t', Math.min(dist / (item.offsetWidth + 24), 1).toFixed(3));
      if (dist < best) { best = dist; active = i; }
    });
    items.forEach((item, i) => item.classList.toggle('is-active', i === active));
    Array.from(dots.children).forEach((d, i) => d.classList.toggle('is-active', i === active));
  };

  let ticking = false;
  gallery.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  });
  window.addEventListener('resize', update);
  const go = (dir) => gallery.scrollBy({ left: dir * step(), behavior: 'smooth' });
  document.getElementById('gallery-prev').addEventListener('click', () => go(-1));
  document.getElementById('gallery-next').addEventListener('click', () => go(1));
  gallery.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  });
  gallery.scrollLeft = center(0);
  update();
  window.addEventListener('load', () => { gallery.scrollLeft = center(0); update(); });
})();
