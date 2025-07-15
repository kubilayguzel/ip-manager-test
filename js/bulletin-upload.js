// js/bulletin-upload.js
import { getStorage, ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

// Alanlar
const dropArea = document.getElementById("dropAreaTrademark");
const fileInput = document.getElementById("bulletinFileTrademark");
const form = document.getElementById("bulletinUploadFormTrademark");
const selectedFileName = document.getElementById("selectedFileNameTrademark");
const uploadStatus = document.getElementById("uploadStatusTrademark");

let selectedFile = null;

// Sürükle bırak olayları
dropArea.addEventListener("click", () => fileInput.click());

dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.style.border = "2px dashed #1e3c72";
});

dropArea.addEventListener("dragleave", () => {
  dropArea.style.border = "2px dashed #ccc";
});

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.style.border = "2px dashed #ccc";
  selectedFile = e.dataTransfer.files[0];
  selectedFileName.textContent = selectedFile.name;
});

fileInput.addEventListener("change", (e) => {
  selectedFile = e.target.files[0];
  selectedFileName.textContent = selectedFile.name;
});

// Form submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!selectedFile) {
    uploadStatus.textContent = "Lütfen bir dosya seçin.";
    uploadStatus.style.color = "red";
    return;
  }

  try {
    uploadStatus.textContent = "Yükleniyor...";
    uploadStatus.style.color = "#333";

    // Depolama yolu
    const storagePath = `bulletins/${Date.now()}_${selectedFile.name}`;
    const fileRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(fileRef, selectedFile);

    // Progress takibi
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        uploadStatus.textContent = `Yükleniyor: %${percent}`;
      },
      (error) => {
        console.error("Yükleme hatası:", error);
        uploadStatus.textContent = "Hata: " + error.message;
        uploadStatus.style.color = "red";
      },
      () => {
        uploadStatus.textContent = "✅ Yükleme tamamlandı! İşlem başlatıldı.";
        uploadStatus.style.color = "green";
        // İsteğe bağlı: dosya yolunu veya URL'yi saklayabilirsin
      }
    );

  } catch (error) {
    console.error("Hata:", error);
    uploadStatus.textContent = "Hata: " + error.message;
    uploadStatus.style.color = "red";
  }
});
