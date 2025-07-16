import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js";

console.log("✅ bulletin-search.js yüklendi!");

const searchBtn = document.getElementById("searchButton");
const recordsContainer = document.getElementById("recordsContainer");
const goodsModal = document.getElementById("goodsModal");
const goodsList = document.getElementById("goodsList");
const closeGoodsModal = document.getElementById("closeGoodsModal");

searchBtn.addEventListener("click", async () => {
  const type = document.getElementById("bulletinType").value;
  const bulletinNo = document.getElementById("bulletinNo").value.trim();

  if (!bulletinNo) {
    alert("Lütfen bülten numarası girin.");
    return;
  }

  recordsContainer.innerHTML = "<p>Aranıyor...</p>";

  try {
    const bulletinQuery = query(
      collection(db, "trademarkBulletins"),
      where("type", "==", type.toLowerCase()),
      where("bulletinNo", "==", bulletinNo)
    );
    const bulletinSnap = await getDocs(bulletinQuery);

    if (bulletinSnap.empty) {
      recordsContainer.innerHTML = "<p>Bülten bulunamadı.</p>";
      return;
    }

    const bulletinId = bulletinSnap.docs[0].id;

    const recordsQuery = query(
      collection(db, "trademarkBulletinRecords"),
      where("bulletinId", "==", bulletinId)
    );
    const recordsSnap = await getDocs(recordsQuery);

    if (recordsSnap.empty) {
      recordsContainer.innerHTML = "<p>Bu bültene ait kayıt bulunamadı.</p>";
      return;
    }

    let html = `
    <table class="tasks-table">
      <thead>
        <tr>
          <th>Başvuru No</th>
          <th>Marka Örneği</th>
          <th>Marka Adı</th>
          <th>Hak Sahibi</th>
          <th>Başvuru Tarihi</th>
          <th>Sınıflar</th>
          <th>İşlem</th>
        </tr>
      </thead>
      <tbody>
    `;

    recordsSnap.forEach(doc => {
      const r = doc.data();
      const imageTag = r.imagePath
        ? `<img class="marka-image" src="https://firebasestorage.googleapis.com/v0/b/ip-manager-production-aab4b.appspot.com/o/${encodeURIComponent(r.imagePath)}?alt=media"/>`
        : "-";

      html += `
        <tr>
          <td>${r.applicationNo || "-"}</td>
          <td>${imageTag}</td>
          <td>${r.markName || "-"}</td>
          <td>${r.holders?.[0]?.name || "-"}</td>
          <td>${r.applicationDate || "-"}</td>
          <td>${r.niceClasses || "-"}</td>
          <td><button class="action-btn" data-goods='${JSON.stringify(r.goods || [])}'>Eşyalar</button></td>
        </tr>`;
    });

    html += "</tbody></table>";
    recordsContainer.innerHTML = html;

    document.querySelectorAll(".action-btn[data-goods]").forEach(btn => {
      btn.addEventListener("click", () => {
        const goods = JSON.parse(btn.dataset.goods);
        goodsList.innerHTML = goods.length
          ? goods.map(g => `<li>${g}</li>`).join("")
          : "<li>Veri yok.</li>";
        goodsModal.style.display = "flex";
      });
    });
  } catch (err) {
    console.error(err);
    recordsContainer.innerHTML = "<p>Bir hata oluştu.</p>";
  }
});

closeGoodsModal.onclick = () => {
  goodsModal.style.display = "none";
};
