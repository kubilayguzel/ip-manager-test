// add_missing_transaction_types.js içeriği
import { transactionTypeService } from '../firebase-config.js'; // firebase-config.js dosyanızın yolu bu dosyaya göre doğru olmalı

async function addMissingChildTransactionTypes() {
    const missingChildTypes = [
        {
            id: 'eksiklik_bildirimi',
            name: 'Eksiklik Bildirimi',
            alias: 'Eksiklik Bildirimi',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'ret_karari',
            name: 'Ret Kararı',
            alias: 'Ret Kararı',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Karar',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'kısmi_yayin_karari',
            name: 'Kısmi Yayın Kararı',
            alias: 'Kısmi Yayın Kararı',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Yayın Kararı',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'yayin_karari',
            name: 'Yayın Kararı',
            alias: 'Yayın Kararı',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Yayın Kararı',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'tescil_ucreti_bildirimi',
            name: 'Tescil Ücreti Bildirimi',
            alias: 'Tescil Ücreti Bildirimi',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'tescil_belgesi',
            name: 'Tescil Belgesi',
            alias: 'Tescil Belgesi',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Tescil Belgesi',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'islemden_kaldirma_karari',
            name: 'İşlemden Kaldırma Kararı',
            alias: 'İşlemden Kaldırma Kararı',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Karar',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'kullanim_ispati_delili_talebi',
            name: 'Kullanım İspatı Delili Talebi',
            alias: 'Kullanım İspatı Delili Talebi',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'kullanim_ispati_delili_sunma',
            name: 'Kullanım İspatı Delili Sunma',
            alias: 'Kullanım İspatı Delili Sunma',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'muvafakat_sunumu',
            name: 'Muvafakat Sunumu',
            alias: 'Muvafakat Sunumu',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Genel Belge',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'eksiklik_giderme',
            name: 'Eksiklik Giderme',
            alias: 'Eksiklik Giderme',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itiraza_karsi_gorus',
            name: 'İtiraza Karşı Görüş',
            alias: 'İtiraza Karşı Görüş',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itiraz_bildirimi',
            name: 'İtiraz Bildirimi',
            alias: 'İtiraz Bildirimi',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itirazi_geri_cekme',
            name: 'İtirazı Geri Çekme',
            alias: 'İtirazı Geri Çekme',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Resmi Yazışma',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itiraza_ek_belge',
            name: 'İtiraza Ek Belge',
            alias: 'İtiraza Ek Belge',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Genel Belge',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itiraz_kabul',
            name: 'İtiraz Kabul',
            alias: 'İtiraz Kabul',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Karar',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itiraz_kismen_kabul',
            name: 'İtiraz Kısmen Kabul',
            alias: 'İtiraz Kısmen Kabul',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Karar',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'itiraz_ret',
            name: 'İtiraz Ret',
            alias: 'İtiraz Ret',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Karar',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
        },
        {
            id: 'kabul_karari',
            name: 'Kabul Kararı',
            alias: 'Kabul Kararı',
            hierarchy: 'child',
            ipType: 'trademark',
            documentDesignationDefault: 'Karar',
            expectedParentTypeIds: [] // İsteğiniz üzerine boş dizi olarak ayarlandı
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