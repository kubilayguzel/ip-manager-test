// bulletin-search.js

const db = firebase.firestore();

document.getElementById("searchBtn").addEventListener("click", async () => {
  const type = document.getElementById("bulletinType").value;
  const no = document.getElementById("bulletinNo").value.trim();
  const statusEl = document.getElementById("statusMessage");
  const table = document.getElementById("resultsTable");
  const tbody = document.getElementById("resultsBody");

  if (!no) {
    statusEl.textContent = "Lütfen bülten numarasını giriniz.";
    table.style.display = "none";
    return;
  }

  statusEl.textContent = "Bülten aranıyor...";
  table.style.display = "none";
  tbody.innerHTML = "";

  try {
    // Bülten ID'sini bul
    const bulletinSnap = await db.collection("trademarkBulletins")
      .where("type", "==", type)
      .where("bulletinNo", "==", no)
      .limit(1)
      .get();

    if (bulletinSnap.empty) {
      statusEl.textContent = "Bülten bulunamadı.";
      return;
    }

    const bulletinId = bulletinSnap.docs[0].id;

    // Kayıtları getir
    const recordsSnap = await db.collection("trademarkBulletinRecords")
      .where("bulletinId", "==", bulletinId)
      .get();

    if (recordsSnap.empty) {
      statusEl.textContent = "Bu bültende kayıt bulunmuyor.";
      return;
    }

    // Sonuçları tabloya ekle
    recordsSnap.forEach(doc => {
      const data = doc.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${data.applicationNo || ""}</td>
        <td>${data.holder || ""}</td>
        <td>${data.niceClasses || ""}</td>
      `;
      tbody.appendChild(tr);
    });

    statusEl.textContent = `Toplam ${recordsSnap.size} kayıt listelendi.`;
    table.style.display = "table";
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Bir hata oluştu. Konsolu kontrol edin.";
  }
});
