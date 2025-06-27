// add_missing_transaction_types.js içeriği
import { transactionTypeService } from '../firebase-config.js'; // firebase-config.js dosyanızın yolu bu dosyaya göre doğru olmalı

async function addMissingChildTransactionTypes() {
    const missingChildTypes = [
  {
    "id": "1",
    "name": "3.Kişi Görüşü",
    "alias": "3.Kişi Görüşü",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "2",
    "name": "Başvuru",
    "alias": "Başvuru",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "6",
      "23",
      "24",
      "25",
      "26",
      "41",
      "42",
      "43",
      "45",
      "46",
      "47"
    ],
    "indexFile": [
      "24",
      "26",
      "41",
      "42",
      "43",
      "45",
      "46",
      "47"
    ],
    "indexBulk": [
      "24",
      "26",
      "41",
      "42",
      "43",
      "45",
      "46",
      "47"
    ],
    "indexManuel": [
      "6",
      "23",
      "24",
      "25",
      "26",
      "41",
      "42",
      "43",
      "45",
      "46",
      "47"
    ],
    "taskTriggered": null
  },
  {
    "id": "3",
    "name": "Birleşme",
    "alias": "Birleşme",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "4",
    "name": "Bölünme",
    "alias": "Bölünme",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "5",
    "name": "Devir",
    "alias": "Devir",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "6",
    "name": "Eşya Sınırlandırma",
    "alias": "Eşya Sınırlandırma",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "7",
    "name": "Karara İtiraz",
    "alias": "Karara İtiraz",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "28",
      "29",
      "30",
      "37",
      "44"
    ],
    "indexFile": [
      "24",
      "28",
      "29",
      "30"
    ],
    "indexBulk": [
      "24",
      "28",
      "29",
      "30"
    ],
    "indexManuel": [
      "24",
      "25",
      "28",
      "29",
      "30",
      "37",
      "44"
    ],
    "taskTriggered": null
  },
  {
    "id": "8",
    "name": "Karara İtirazı Geri Çekme",
    "alias": "Karara İtirazı Geri Çekme",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "9",
    "name": "Kullanım Delili Sunma",
    "alias": "Kullanım Delili Sunma",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "10",
    "name": "Lisans",
    "alias": "Lisans",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "11",
    "name": "Madrid Başvurusu Ücret Ödeme",
    "alias": "Madrid Başvurusu Ücret Ödeme",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "12",
    "name": "Menşe Memleket Belgesi",
    "alias": "Menşe Memleket Belgesi",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "13",
    "name": "Rehin/Teminat",
    "alias": "Rehin/Teminat",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "14",
    "name": "Sicil Sureti",
    "alias": "Sicil Sureti",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "15",
    "name": "Tanınmışlık Tespiti",
    "alias": "Tanınmışlık Tespiti",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "16",
    "name": "Tescil Belgesi Sureti",
    "alias": "Tescil Belgesi Sureti",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "17",
    "name": "Vazgeçme",
    "alias": "Vazgeçme",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "18",
    "name": "Veraset İle İntikal",
    "alias": "Veraset İle İntikal",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "19",
    "name": "Yayıma İtirazin Yeniden Incelenmesi",
    "alias": "Yayıma İtirazin Yeniden Incelenmesi",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "27",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36",
      "37",
      "38"
    ],
    "indexFile": [
      "24",
      "27",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36"
    ],
    "indexBulk": [
      "24",
      "27",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36"
    ],
    "indexManuel": [
      "24",
      "25",
      "27",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36",
      "37",
      "38"
    ],
    "taskTriggered": null
  },
  {
    "id": "20",
    "name": "Yayına İtiraz",
    "alias": "Yayına İtiraz",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "27",
      "28",
      "29",
      "30",
      "37",
      "38",
      "39"
    ],
    "indexFile": [
      "24",
      "27",
      "28",
      "29",
      "30",
      "48"
    ],
    "indexBulk": [
      "24",
      "27",
      "28",
      "29",
      "30",
      "48"
    ],
    "indexManuel": [
      "24",
      "25",
      "27",
      "28",
      "29",
      "30",
      "37",
      "38",
      "39"
    ],
    "taskTriggered": null
  },
  {
    "id": "21",
    "name": "Yayına İtirazı Geri Çekme",
    "alias": "Yayına İtirazı Geri Çekme",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "22",
    "name": "Yenileme",
    "alias": "Yenileme",
    "ipType": "trademark",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [
      "24",
      "25",
      "40",
      "43"
    ],
    "indexFile": [
      "24",
      "40",
      "43"
    ],
    "indexBulk": [
      "24",
      "40",
      "43"
    ],
    "indexManuel": [
      "24",
      "25",
      "40",
      "43"
    ],
    "taskTriggered": null
  },
  {
    "id": "23",
    "name": "Tescil Ücreti Ödeme",
    "alias": "Tescil Ücreti Ödeme",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "24",
    "name": "Eksiklik Bildirimi",
    "alias": "Eksiklik Bildirimi",
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
    "taskTriggered": 25.0
  },
  {
    "id": "25",
    "name": "Eksiklik Giderme",
    "alias": "Eksiklik Giderme",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "26",
    "name": "İşlemden Kaldırma Kararı",
    "alias": "İşlemden Kaldırma Kararı",
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
    "taskTriggered": 7.0
  },
  {
    "id": "27",
    "name": "İtiraz Bildirimi",
    "alias": "İtiraz Bildirimi",
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
    "taskTriggered": 38.0
  },
  {
    "id": "28",
    "name": "İtiraz Kabul",
    "alias": "İtiraz Kabul",
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
    "taskTriggered": 19.0
  },
  {
    "id": "29",
    "name": "İtiraz Kısmen Kabul",
    "alias": "İtiraz Kısmen Kabul",
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
    "taskTriggered": 19.0
  },
  {
    "id": "30",
    "name": "İtiraz Ret",
    "alias": "İtiraz Ret",
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
    "taskTriggered": 19.0
  },
  {
    "id": "31",
    "name": "Başvuru Sahibi - İtiraz Kabul",
    "alias": "Başvuru Sahibi - İtiraz Kabul",
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
    "taskTriggered": 49.0
  },
  {
    "id": "32",
    "name": "Başvuru Sahibi - İtiraz Kısmen Kabul",
    "alias": "Başvuru Sahibi - İtiraz Kısmen Kabul",
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
    "taskTriggered": 49.0
  },
  {
    "id": "33",
    "name": "Başvuru Sahibi - İtiraz Ret",
    "alias": "Başvuru Sahibi - İtiraz Ret",
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
    "taskTriggered": 49.0
  },
  {
    "id": "34",
    "name": "İtiraz Sahibi - İtiraz Kabul",
    "alias": "İtiraz Sahibi - İtiraz Kabul",
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
    "taskTriggered": 49.0
  },
  {
    "id": "35",
    "name": "İtiraz Sahibi - İtiraz Kısmen Kabul",
    "alias": "İtiraz Sahibi - İtiraz Kısmen Kabul",
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
    "taskTriggered": 49.0
  },
  {
    "id": "36",
    "name": "İtiraz Sahibi - İtiraz Ret",
    "alias": "İtiraz Sahibi - İtiraz Ret",
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
    "taskTriggered": 49.0
  },
  {
    "id": "37",
    "name": "İtiraza Ek Belge",
    "alias": "İtiraza Ek Belge",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "38",
    "name": "İtiraza Karşı Görüş",
    "alias": "İtiraza Karşı Görüş",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "39",
    "name": "Kullanım İspatı Delili Sunma",
    "alias": "Kullanım İspatı Delili Sunma",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "40",
    "name": "Kabul Kararı",
    "alias": "Kabul Kararı",
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
    "taskTriggered": null
  },
  {
    "id": "41",
    "name": "Yayın Kararı",
    "alias": "Yayın Kararı",
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
    "taskTriggered": null
  },
  {
    "id": "42",
    "name": "Kısmi Yayın Kararı",
    "alias": "Kısmi Yayın Kararı",
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
    "taskTriggered": 7.0
  },
  {
    "id": "43",
    "name": "Ret Kararı",
    "alias": "Ret Kararı",
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
    "taskTriggered": 7.0
  },
  {
    "id": "44",
    "name": "Muvaffakat Sunumu",
    "alias": "Muvaffakat Sunumu",
    "ipType": "trademark",
    "hierarchy": "child",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
  },
  {
    "id": "45",
    "name": "Tescil Belgesi",
    "alias": "Tescil Belgesi",
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
    "taskTriggered": null
  },
  {
    "id": "46",
    "name": "Tescil Ücreti Bildirimi",
    "alias": "Tescil Ücreti Bildirimi",
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
    "taskTriggered": 23.0
  },
  {
    "id": "47",
    "name": "Karar Düzeltme",
    "alias": "Karar Düzeltme",
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
    "taskTriggered": 7.0
  },
  {
    "id": "48",
    "name": "Kullanım Delili Talebi",
    "alias": "Kullanım Delili Talebi",
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
    "taskTriggered": 39.0
  },
  {
    "id": "49",
    "name": "YİDK Kararının İptali",
    "alias": "YİDK Kararının İptali",
    "ipType": "suit",
    "hierarchy": "parent",
    "applicableToMainType": [
      "trademark"
    ],
    "documentDesignationDefault": null,
    "order": null,
    "isTopLevelSelectable": true,
    "allowedChildTypes": [],
    "indexFile": [],
    "indexBulk": [],
    "indexManuel": [],
    "taskTriggered": null
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