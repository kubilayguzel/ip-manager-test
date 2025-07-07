// add_missing_transaction_types.js içeriği
import { transactionTypeService } from '../firebase-config.js'; // firebase-config.js dosyanızın yolu bu dosyaya göre doğru olmalı

async function addMissingChildTransactionTypes() {
    const missingChildTypes = [
  {
    "id": "50",
    "name": "Yayına İtiraz Kabul",
    "alias": "Yayına İtiraz Kabul",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": false,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": "19"
  },
  {
    "id": "51",
    "name": "Yayına İtiraz Kısmen Kabul",
    "alias": "Yayına İtiraz Kısmen Kabul",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": false,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": "19"
  },
  {
    "id": "52",
    "name": "Yayına İtiraz Ret",
    "alias": "Yayına İtiraz Ret",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": false,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": "19"
  }
];

    console.log("Eksik alt işlem tipleri Firestore'a ekleniyor/güncelleniyor...");

    for (const typeData of missingChildTypes) {
        const result = await transactionTypeService.addTransactionType(typeData);
        if (result.success) {
            console.log(`✅ İşlem tipi başarıyla eklendi/güncellendi: ${typeData.id} (${typeData.alias || typeData.name})`);
        } else {
            console.error(`❌ İşlem tipi eklenirken/güncellenirken hata oluştu ${typeData.id}:`, result.error);
        }
    }
    console.log("Tüm eksik alt işlem tipleri için işlem tamamlandı.");
}

// Fonksiyonu başlat
addMissingChildTransactionTypes();
