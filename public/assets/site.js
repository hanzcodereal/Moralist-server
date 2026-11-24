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
