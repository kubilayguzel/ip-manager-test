// Marka bülteni alanı
const dropAreaTrademark = document.getElementById('dropAreaTrademark');
const fileInputTrademark = document.getElementById('bulletinFileTrademark');
const selectedFileNameTrademark = document.getElementById('selectedFileNameTrademark');

// Tıklama
dropAreaTrademark.addEventListener('click', () => fileInputTrademark.click());

// Sürükle bırak
dropAreaTrademark.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropAreaTrademark.style.backgroundColor = '#f0f4f8';
});
dropAreaTrademark.addEventListener('dragleave', () => {
  dropAreaTrademark.style.backgroundColor = '';
});
dropAreaTrademark.addEventListener('drop', (e) => {
  e.preventDefault();
  fileInputTrademark.files = e.dataTransfer.files;
  updateSelectedFileTrademark();
  dropAreaTrademark.style.backgroundColor = '';
});

fileInputTrademark.addEventListener('change', updateSelectedFileTrademark);

function updateSelectedFileTrademark() {
  if (fileInputTrademark.files.length > 0) {
    selectedFileNameTrademark.textContent = `Seçilen dosya: ${fileInputTrademark.files[0].name}`;
  } else {
    selectedFileNameTrademark.textContent = '';
  }
}
