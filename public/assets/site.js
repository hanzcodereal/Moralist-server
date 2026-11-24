// Tombol salin SHA-256 di halaman unduhan.
const button = document.getElementById('copy-sha');
if (button) {
  const status = document.getElementById('copy-status');
  button.addEventListener('click', async () => {
    const value = document.getElementById(button.dataset.target).textContent.trim();
    try {
      await navigator.clipboard.writeText(value);
      status.textContent = 'SHA-256 disalin ke papan klip.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.target));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'Teks sudah dipilih. Salin dengan menekan tahan lalu pilih Salin.';
    }
  });
}
