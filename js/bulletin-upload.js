// js/bulletin-upload.js
import { getStorage, ref, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const storage = getStorage();

// Alanlar
const dropArea = document.getElementById("dropAreaTrademark");
const fileInput = document.getElementById("bulletinFileTrademark");
const form = document.getElementById("bulletinUploadFormTrademark");
const selectedFileName = document.getElementById("selectedFileNameTrademark");
const uploadStatus = document.getElementById("uploadStatusTrademark");
const progressContainer = document.getElementById("progressContainer");
const progressBar = document.getElementById("progressBar");

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
    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressBar.textContent = "0%";

    const storagePath = `bulletins/${Date.now()}_${selectedFile.name}`;
    const fileRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(fileRef, selectedFile);

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        uploadStatus.textContent = `Yükleniyor: %${percent}`;
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
      },
      (error) => {
        console.error("Yükleme hatası:", error);
        uploadStatus.textContent = "Hata: " + error.message;
        uploadStatus.style.color = "red";
        progressBar.style.background = "crimson";
        progressBar.textContent = "HATA";
      },
      () => {
        uploadStatus.textContent = "✅ Yükleme tamamlandı! İşlem başlatıldı.";
        uploadStatus.style.color = "green";
        progressBar.style.width = "100%";
        progressBar.textContent = "100%";
      }
    );
  } catch (error) {
    console.error("Hata:", error);
    uploadStatus.textContent = "Hata: " + error.message;
    uploadStatus.style.color = "red";
  }
});
