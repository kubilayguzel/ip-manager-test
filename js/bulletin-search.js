import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from '..firebase-config.js';

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

        // Bülten kaydını al
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

        let html = `<table>
            <thead>
                <tr>
                    <th>Başvuru No</th>
                    <th>Hak Sahibi</th>
                    <th>Sınıflar</th>
                </tr>
            </thead>
            <tbody>`;

        recordsSnapshot.forEach((doc) => {
            const r = doc.data();
            html += `
                <tr>
                    <td>${r.applicationNo}</td>
                    <td>${r.holder}</td>
                    <td>${r.niceClasses}</td>
                </tr>`;
        });

        html += "</tbody></table>";
        recordsContainer.innerHTML = html;

    } catch (err) {
        console.error("Sorgulama hatası:", err);
        recordsContainer.innerHTML = "<p>Bir hata oluştu. Konsolu kontrol edin.</p>";
    }
});
