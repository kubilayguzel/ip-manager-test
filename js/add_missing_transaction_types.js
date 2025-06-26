// add_missing_transaction_types.js içeriği
import { transactionTypeService } from '../firebase-config.js'; // firebase-config.js dosyanızın yolu bu dosyaya göre doğru olmalı

async function addMissingChildTransactionTypes() {
    const missingChildTypes = [
    {
    "id": "litigation_main_type",
    "name": "Dava",
    "ipType": "dava",
    "hierarchy": "parent",
    "applicableToMainType": ["all"],
    "allowedChildTypes": ["litigation_yidk_annulment", "dava_acma", "dava_cevap", "duruşma", "bilirkişi_raporu", "istinaf", "temyiz", "karar"],
    "documentDesignationDefault": "Dava Dosyası",
    "order": 200,
    "alias": "Dava"
    },
    {
    "id": "litigation_yidk_annulment",
    "name": "YİDK Kararının İptali",
    "alias": "YİDK Kararının İptali",
    "ipType": "dava",
    "hierarchy": "child",
    "applicableToMainType": ["all"],
    "documentDesignationDefault": "Mahkeme Kararı",
    "order": 210,
    "isTopLevelSelectable": true,
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


        <script type="module" src="./js/add_missing_transaction_types.js"></script>