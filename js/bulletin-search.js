import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase-config.js";

console.log("✅ bulletin-search.js yüklendi!");

const searchButton = document.getElementById("searchButton");
const recordsContainer = document.getElementById("recordsContainer");
const goodsModal = document.getElementById("goodsModal");
const closeModal = document.getElementById("closeModal");
const goodsList = document.getElementById("goodsList");

searchButton.addEventListener("click", async () => {
    const type = document.getElementById("bulletinType").value;
    const bulletinNo = document.getElementById("bulletinNo").value.trim();

    if (!bulletinNo) {
        alert("Lütfen bülten numarası girin.");
        return;
    }

    recordsContainer.innerHTML = "<p class='no-results'>Aranıyor...</p>";

    try {
        const bulletinQuery = query(
            collection(db, "trademarkBulletins"),
            where("type", "==", type.toLowerCase()),
            where("bulletinNo", "==", bulletinNo)
        );
        const bulletinSnapshot = await getDocs(bulletinQuery);

        if (bulletinSnapshot.empty) {
            recordsContainer.innerHTML = "<p class='no-results'>Belirtilen kriterlerde bülten bulunamadı.</p>";
            return;
        }

        const bulletinId = bulletinSnapshot.docs[0].id;

        const recordsQuery = query(
            collection(db, "trademarkBulletinRecords"),
            where("bulletinId", "==", bulletinId)
        );

        const recordsSnapshot = await getDocs(recordsQuery);

        if (recordsSnapshot.empty) {
            recordsContainer.innerHTML = "<p class='no-results'>Bu bültene ait kayıt bulunamadı.</p>";
            return;
        }

        let html = `<table class="results-table">
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
            <tbody>`;

        recordsSnapshot.forEach((doc) => {
            const r = doc.data();
            const holderName = r.holders?.[0]?.name || r.holders?.[0]?.address || "-";
            const imageUrl = r.imagePath
              ? `https://firebasestorage.googleapis.com/v0/b/ip-manager-production-aab4b.appspot.com/o/${encodeURIComponent(r.imagePath)}?alt=media`
              : "";

            html += `
              <tr>
                <td>${r.applicationNo || "-"}</td>
                <td>${imageUrl ? `<img src="${imageUrl}" alt="Marka Görseli" class="mark-image"/>` : "-"}</td>
                <td>${r.markName || "-"}</td>
                <td>${holderName}</td>
                <td>${r.applicationDate || "-"}</td>
                <td>${r.niceClasses || "-"}</td>
                <td><button class="action-btn" data-goods='${JSON.stringify(r.goods || [])}'>Eşyalar</button></td>
              </tr>`;
        });

        html += "</tbody></table>";
        recordsContainer.innerHTML = html;

        document.querySelectorAll(".action-btn[data-goods]").forEach(btn => {
            btn.addEventListener("click", () => {
                const goodsArray = JSON.parse(btn.dataset.goods);
                goodsList.innerHTML = goodsArray.length
                    ? `<ul>${goodsArray.map(g => `<li>${g}</li>`).join("")}</ul>`
                    : "<p>Mal/hizmet listesi yok.</p>";
                goodsModal.style.display = "flex";
            });
        });

    } catch (err) {
        console.error("Sorgulama hatası:", err);
        recordsContainer.innerHTML = "<p class='no-results'>Bir hata oluştu. Konsolu kontrol edin.</p>";
    }
});

closeModal.addEventListener("click", () => {
    goodsModal.style.display = "none";
});
