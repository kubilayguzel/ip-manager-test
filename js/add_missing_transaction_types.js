// add_missing_transaction_types.js içeriği
import { transactionTypeService } from './firebase-config.js'; // firebase-config.js dosyanızın yolu bu dosyaya göre doğru olmalı

async function addMissingChildTransactionTypes() {
    const missingChildTypes = [
        {
            id: 'itiraz_kabul_basvuru_sahibi',
            name: 'Başvuru Sahibi - İtiraz Kabul',
            alias: 'Başvuru Sahibi - İtiraz Kabul',
            hierarchy: 'child',
            ipType: 'trademark',
            order: 300,
            documentDesignationDefault: 'Karar',
        },
        {
            id: 'itiraz_kısmen_kabul_basvuru_sahibi',
            name: 'Başvuru Sahibi - İtiraz Kısmen Kabul',
            alias: 'Başvuru Sahibi - İtiraz Kısmen Kabul',
            hierarchy: 'child',
            ipType: 'trademark',
            order: 310,
            documentDesignationDefault: 'Karar',
        },
        {
            id: 'itiraz_ret_basvuru_sahibi',
            name: 'Başvuru Sahibi - İtiraz Ret',
            alias: 'Başvuru Sahibi - İtiraz Ret',
            hierarchy: 'child',
            ipType: 'trademark',
            order: 320,
            documentDesignationDefault: 'Karar',
        }
                {
            id: 'itiraz_kabul_itiraz_sahibi',
            name: 'İtiraz Sahibi - İtiraz Kabul',
            alias: 'İtiraz Sahibi - İtiraz Kabul',
            hierarchy: 'child',
            ipType: 'trademark',
            order: 330,
            documentDesignationDefault: 'Karar',
        },
        {
            id: 'itiraz_kısmen_kabul_itiraz_sahibi',
            name: 'İtiraz Sahibi - İtiraz Kısmen Kabul',
            alias: 'İtiraz Sahibi - İtiraz Kısmen Kabul',
            hierarchy: 'child',
            ipType: 'trademark',
            order: 340,
            documentDesignationDefault: 'Karar',
        },
        {
            id: 'itiraz_ret_itiraz_sahibi',
            name: 'İtiraz Sahibi - İtiraz Ret',
            alias: 'İtiraz Sahibi - İtiraz Ret',
            hierarchy: 'child',
            ipType: 'trademark',
            order: 350,
            documentDesignationDefault: 'Karar',
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