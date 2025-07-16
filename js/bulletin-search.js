import { loadSharedLayout } from "./js/layout-loader.js";
loadSharedLayout({ activeMenuLink: "bulletin-search.html" });
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { db } from "../firebase-config.js";
import { loadSharedLayout } from "./layout-loader.js";

console.log("✅ bulletin-search.js yüklendi!");

loadSharedLayout();

document.getElementById("searchButton").addEventListener("click", async () => {
    const type = document.getElementById("bulletinType").value;
    const bulletinNo = document.getElementById("bulletinNo").value.trim();

    console.log("Sorgu başladı:", { type, bulletinNo });

    if (!bulletinNo) {
        alert("Lütfen bülten numarası girin.");
        return;
    }

    const recordsContainer = document.getElementById("recordsContainer");
    recordsContainer.innerHTML = "<p>Aranıyor...</p>";

    try {
        // trademarkBulletins içinde belgeyi bul
        const bulletinQuery = query(
            collection(db, "trademarkBulletins"),
            where("type", "==", type.toLowerCase()),
            where("bulletinNo", "==", bulletinNo)
        );

        const bulletinSnapshot = await getDocs(bulletinQuery);

        if (bulletinSnapshot.empty) {
            recordsContainer.innerHTML = "<p>Belirtilen kriterlerde bülten bulunamadı.</p>";
            console.log("Bülten bulunamadı.");
            return;
        }

        const bulletinDoc = bulletinSnapshot.docs[0];
        const bulletinId = bulletinDoc.id;
        console.log("Bulunan bülten ID:", bulletinId);

        // Bu bültene ait kayıtları al
        const recordsQuery = query(
            collection(db, "trademarkBulletinRecords"),
            where("bulletinId", "==", bulletinId)
        );

        const recordsSnapshot = await getDocs(recordsQuery);

        if (recordsSnapshot.empty) {
            recordsContainer.innerHTML = "<p>Bu bültene ait kayıt bulunamadı.</p>";
            return;
        }

        let html = `
        <div class="tasks-container">
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
            <tbody>`;

        const storage = getStorage();
        for (const doc of recordsSnapshot.docs) {
            const r = doc.data();
            let imageUrl = "";
            if (r.imagePath) {
                try {
                    const fileRef = ref(storage, r.imagePath);
                    imageUrl = await getDownloadURL(fileRef);
                } catch (err) {
                    console.warn("Görsel URL alınamadı:", err);
                }
            }

            html += `
            <tr>
                <td>${r.applicationNo || "-"}</td>
                <td>${imageUrl ? `<img src="${imageUrl}" style="height:50px;">` : "-"}</td>
                <td>${r.markName || "-"}</td>
                <td>${r.holders?.[0]?.name || "-"}</td>
                <td>${r.applicationDate || "-"}</td>
                <td>${r.niceClasses || "-"}</td>
                <td><button class="action-btn" onclick='showGoods(${JSON.stringify(r.goods || [])})'>Eşyalar</button></td>
            </tr>`;
        }

        html += "</tbody></table></div>";
        recordsContainer.innerHTML = html;

    } catch (err) {
        console.error("Sorgulama hatası:", err);
        recordsContainer.innerHTML = "<p>Bir hata oluştu. Konsolu kontrol edin.</p>";
    }
});

// Modal açma fonksiyonu
window.showGoods = (goods) => {
    const modal = document.getElementById("goods-modal");
    const body = document.getElementById("goods-modal-body");
    body.innerHTML = goods.length
        ? `<ul>${goods.map(g => `<li>${g}</li>`).join("")}</ul>`
        : "<p>Tanımlı eşya yok.</p>";
    modal.style.display = "flex";
};

document.getElementById("close-goods-modal").addEventListener("click", () => {
    document.getElementById("goods-modal").style.display = "none";
});
