import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc, 
    query,
    orderBy,
    where,
    getDoc, 
    setDoc,
    arrayUnion, 
    arrayRemove,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// --- Firebase App Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyCbhoIXJT9g5ftW62YUlo44M4BOzM9tJ7M",
    authDomain: "ip-manager-production.firebaseapp.com",
    projectId: "ip-manager-production",
    storageBucket: "ip-manager-production.firebasestorage.app",
    messagingSenderId: "378017128708",
    appId: "1:378017128708:web:e2c6fa7b8634022f2ef051",
    measurementId: "G-TQB1CF18Q8"
};

let app, auth, db;
let isFirebaseAvailable = false;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isFirebaseAvailable = true;
    console.log('🔥 Firebase initialized successfully');
} catch (error) {
    console.error('⚠️ Firebase initialization failed:', error.message);
    isFirebaseAvailable = false;
    // Firebase bağlantı hatası durumunda kullanıcıya bildirim göstermek için
    // showNotification fonksiyonunu doğrudan burada çağıramayız çünkü utils.js henüz yüklenmemiş olabilir.
    // Bu tür kritik hatalar için genellikle özel bir UI gösterimi veya ana sayfada bir uyarı mesajı kullanılır.
    // Ancak, şu anki durumda konsol çıktısı yeterli.
}

// --- Helper Functions & Constants ---
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const subDesignationTranslations = {
    'opposition_to_publication': 'Yayına İtiraz',
    'response_to_opposition': 'İtiraza Karşı Görüş',
    'opposition_decision_rejected': 'Yayına İtiraz Kararı - Ret',
    'opposition_decision_accepted': 'Yayına İtiraz Kararı - Kabul'
};

export const documentDesignationTranslations = {
    'opposition_trademark_office': 'Yayına İtiraz - Markalar Dairesi',
    'Başvuru Ek Dokümanı': 'Başvuru Ek Dokümanı',
    'Resmi Yazışma': 'Resmi Yazışma',
    'Vekaletname': 'Vekaletname',
    'Teknik Çizim': 'Teknik Çizim',
    'Karar': 'Karar',
    'Finansal Belge': 'Finansal Belge',
    'Yayın Kararı': 'Yayın Kararı',
    'Ret Kararı': 'Ret Kararı',
    'Tescil Belgesi': 'Tescil Belgesi',
    'Araştırma Raporu': 'Araştırma Raporu',
    'İnceleme Raporu': 'İnceleme Raporu',
    'Diğer Belge': 'Diğer Belge',
    'Genel Not': 'Genel Not',
    'Ödeme Dekontu': 'Ödeme Dekontu'
};

// --- Authentication Service ---
export const authService = {
    auth: auth,
    isFirebaseAvailable: isFirebaseAvailable,
    async getUserRole(uid) {
        if (!this.isFirebaseAvailable) {
            console.warn("Firebase kullanılamıyor, kullanıcı rolü yerel olarak alınamaz.");
            return null; // Yerel modda rol yönetimi yapılmıyor
        }
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (!userDoc.exists()) {
                console.warn(`Firestore'da ${uid} için kullanıcı belgesi bulunamadı. Varsayılan rol 'user' olarak atanıyor.`);
                return 'user'; // Belge yoksa varsayılan rol
            }
            return userDoc.data().role;
        } catch (error) {
            console.error("Kullanıcı rolü alınırken hata:", error);
            return null; // Hata durumunda null döndür, frontend yönetir
        }
    },
    async setUserRole(uid, email, displayName, role) {
        if (!this.isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. Rol atanamaz." };
        try {
            await setDoc(doc(db, 'users', uid), {
                email, displayName, role,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return { success: true };
        } catch (error) {
            console.error("Kullanıcı rolü atanırken hata:", error);
            return { success: false, error: error.message };
        }
    },
    async signIn(email, password) {
        if (!isFirebaseAvailable) return this.localSignIn(email, password);
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            const user = result.user;
            const role = await this.getUserRole(user.uid) || 'user'; // Rolü çek veya varsayılan atama
            const userData = { uid: user.uid, email: user.email, displayName: user.displayName, role, isSuperAdmin: role === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData, message: "Giriş başarılı!" }; // Mesaj eklendi
        } catch (error) {
            let errorMessage = "Giriş başarısız oldu.";
            if (error.code) {
                switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = "Hatalı e-posta veya şifre.";
                        break;
                    case 'auth/invalid-email':
                        errorMessage = "Geçersiz e-posta adresi formatı.";
                        break;
                    case 'auth/user-disabled':
                        errorMessage = "Bu kullanıcı hesabı devre dışı bırakılmıştır.";
                        break;
                    default:
                        errorMessage = "Giriş sırasında bir hata oluştu: " + error.message;
                }
            }
            console.error("Giriş hatası:", error);
            return { success: false, error: errorMessage };
        }
    },
    async signUp(email, password, displayName, initialRole = 'user') {
        if (!isFirebaseAvailable) return this.localSignUp(email, password, displayName, initialRole);
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            const user = result.user;
            await updateProfile(user, { displayName });
            const setRoleResult = await this.setUserRole(user.uid, email, displayName, initialRole);
            if (!setRoleResult.success) throw new Error(setRoleResult.error); // Rol atama hatası fırlat
            
            const userData = { uid: user.uid, email, displayName, role: initialRole, isSuperAdmin: initialRole === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData, message: "Kayıt başarılı!" }; // Mesaj eklendi
        } catch (error) {
            let errorMessage = "Kayıt başarısız oldu.";
            if (error.code) {
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        errorMessage = "Bu e-posta adresi zaten kullanımda.";
                        break;
                    case 'auth/invalid-email':
                        errorMessage = "Geçersiz e-posta adresi formatı.";
                        break;
                    case 'auth/weak-password':
                        errorMessage = "Şifre çok zayıf. En az 6 karakter olmalı.";
                        break;
                    default:
                        errorMessage = "Kayıt sırasında bir hata oluştu: " + error.message;
                }
            }
            console.error("Kayıt hatası:", error);
            return { success: false, error: errorMessage };
        }
    },
    async signOut() {
        if (isFirebaseAvailable) {
            try {
                await signOut(auth);
                console.log("Firebase oturumu kapatıldı.");
            } catch (error) {
                console.error("Firebase oturumu kapatılırken hata:", error);
            }
        }
        localStorage.removeItem('currentUser');
        console.log("Yerel kullanıcı verisi silindi.");
        // Oturum kapatıldıktan sonra yönlendirme frontend'de yapılmalı
    },
    getCurrentUser() {
        const localData = localStorage.getItem('currentUser');
        return localData ? JSON.parse(localData) : null;
    },
    isSuperAdmin() {
        const user = this.getCurrentUser();
        return user?.role === 'superadmin';
    },
    localSignIn(email, password) {
        const accounts = [
            { email: 'demo@ipmanager.com', password: 'demo123', name: 'Demo User', role: 'user' },
            { email: 'admin@ipmanager.com', password: 'admin123', name: 'Admin User', role: 'admin' },
            { email: 'superadmin@ipmanager.com', password: 'superadmin123', name: 'Super Admin', role: 'superadmin' },
        ];
        const account = accounts.find(a => a.email === email && a.password === password);
        if (account) {
            const userData = { uid: `local_${Date.now()}`, email: account.email, displayName: account.name, role: account.role, isSuperAdmin: account.role === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData, message: "Yerel giriş başarılı!" };
        }
        return { success: false, error: 'Hatalı yerel kimlik bilgileri.' };
    },
    localSignUp(email, password, displayName, initialRole) {
        const userData = { uid: `local_${Date.now()}`, email, displayName, role: initialRole, isSuperAdmin: initialRole === 'superadmin' };
        localStorage.setItem('currentUser', JSON.stringify(userData));
        return { success: true, user: userData, message: "Yerel kayıt başarılı!" };
    }
};

// --- Persons Service ---
export const personsService = {
    async addPerson(personData) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Kullanıcı girişi yapılmamış."};
        const newPerson = { ...personData, id: generateUUID(), userId: user.uid, userEmail: user.email, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (isFirebaseAvailable) {
            try {
                await setDoc(doc(db, 'persons', newPerson.id), newPerson);
                return { success: true, data: newPerson };
            } catch (error) {
                console.error("Kişi eklenirken hata:", error);
                return { success: false, error: error.message || "Kişi eklenirken beklenmeyen bir hata oluştu." };
            }
        } else {
            const persons = JSON.parse(localStorage.getItem('persons') || '[]');
            persons.push(newPerson);
            localStorage.setItem('persons', JSON.stringify(persons));
            return { success: true, data: newPerson };
        }
    },
    async getPersons() {
        if (isFirebaseAvailable) {
            const user = authService.getCurrentUser();
            if(!user) return {success: true, data:[]}; // Kullanıcı yoksa boş döndür
            try {
                const q = user.role === 'superadmin' ? query(collection(db, 'persons'), orderBy('name')) : query(collection(db, 'persons'), where('userId', '==', user.uid), orderBy('name'));
                const snapshot = await getDocs(q);
                return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
            } catch (error) {
                console.error("Kişiler alınırken hata:", error);
                return { success: false, error: error.message || "Kişiler yüklenirken beklenmeyen bir hata oluştu." };
            }
        }
        return { success: true, data: JSON.parse(localStorage.getItem('persons') || '[]') };
    },
    async updatePerson(personId, updates) {
        updates.updatedAt = new Date().toISOString();
        if (isFirebaseAvailable) {
            try {
                await updateDoc(doc(db, 'persons', personId), updates);
                return { success: true };
            } catch (error) {
                console.error("Kişi güncellenirken hata:", error);
                return { success: false, error: error.message || "Kişi güncellenirken beklenmeyen bir hata oluştu." };
            }
        } else {
            let persons = JSON.parse(localStorage.getItem('persons') || '[]');
            const index = persons.findIndex(p => p.id === personId);
            if (index > -1) persons[index] = { ...persons[index], ...updates };
            localStorage.setItem('persons', JSON.stringify(persons));
            return { success: true };
        }
    },
    async deletePerson(personId) {
        if (isFirebaseAvailable) {
            try {
                await deleteDoc(doc(db, 'persons', personId));
                return { success: true };
            } catch (error) {
                console.error("Kişi silinirken hata:", error);
                return { success: false, error: error.message || "Kişi silinirken beklenmeyen bir hata oluştu." };
            }
        } else {
            let persons = JSON.parse(localStorage.getItem('persons') || '[]').filter(p => p.id !== personId);
            localStorage.setItem('persons', JSON.stringify(persons));
            return { success: true };
        }
    }
};

// --- IP Records Service ---
export const ipRecordsService = {
    findAllDescendants(transactionId, transactions) {
        const children = transactions.filter(tx => tx.parentId === transactionId);
        return children.reduce((acc, child) => [...acc, child.transactionId, ...this.findAllDescendants(child.transactionId, transactions)], []);
    },
    async addRecord(record) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Kullanıcı girişi yapılmamış."};
        const timestamp = new Date().toISOString();
        // Dosyalara benzersiz ID atayalım
        const filesWithIds = (record.files || []).map(f => ({ ...f, id: f.id || generateUUID() }));

        const newRecord = { ...record, userId: user.uid, userEmail: user.email, createdAt: timestamp, updatedAt: timestamp, transactions: [], files: filesWithIds };
        
        if (isFirebaseAvailable) {
            try {
                const docRef = await addDoc(collection(db, 'ipRecords'), newRecord);
                return { success: true, id: docRef.id };
            } catch (error) {
                console.error("Kayıt eklenirken hata:", error);
                return { success: false, error: error.message || "Kayıt eklenirken beklenmeyen bir hata oluştu." };
            }
        }
        const records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
        newRecord.id = generateUUID(); // Yerel depolama için de ID oluştur
        records.push(newRecord);
        localStorage.setItem('ipRecords', JSON.stringify(records));
        return { success: true, id: newRecord.id };
    },
    async addTransactionToRecord(recordId, transactionData) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Kullanıcı girişi yapılmamış."};
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşlem eklenemez." };
        
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const currentDoc = await getDoc(recordRef);
            if (!currentDoc.exists()) return { success: false, error: "Kayıt bulunamadı." };

            let currentTransactions = currentDoc.data().transactions || []; 
            
            const newTransaction = {
                transactionId: generateUUID(),
                timestamp: new Date().toISOString(),
                userId: user.uid,
                userEmail: user.email,
                ...transactionData 
            };

            currentTransactions.push(newTransaction); 

            await updateDoc(recordRef, {
                transactions: currentTransactions, 
                updatedAt: new Date().toISOString()
            });
            return { success: true, transaction: newTransaction };
        } catch (error) {
            console.error("Kayda işlem eklenirken hata:", error);
            return { success: false, error: error.message || "Kayda işlem eklenirken beklenmeyen bir hata oluştu." };
        }
    },
    async getRecords() {
        if (isFirebaseAvailable) {
            const user = authService.getCurrentUser();
            if(!user) return {success: true, data:[]};
            try {
                const q = user.role === 'superadmin' ? query(collection(db, 'ipRecords'), orderBy('createdAt', 'desc')) : query(collection(db, 'ipRecords'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(q);
                return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
            } catch (error) {
                console.error("Kayıtlar alınırken hata:", error);
                return { success: false, error: error.message || "Kayıtlar yüklenirken beklenmeyen bir hata oluştu." };
            }
        }
        return { success: true, data: JSON.parse(localStorage.getItem('ipRecords') || '[]') };
    },
    async updateRecord(recordId, updates) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Kullanıcı girişi yapılmamış."};
        const timestamp = new Date().toISOString();
        if (isFirebaseAvailable) {
            try {
                const recordRef = doc(db, 'ipRecords', recordId);
                const currentDoc = await getDoc(recordRef);
                if (!currentDoc.exists()) return { success: false, error: "Kayıt bulunamadı." };
                const currentData = currentDoc.data();
                let newTransactions = [...(currentData.transactions || [])]; 

                // Dosya güncellemelerini yönet (mevcut dosyaları koru, yenileri ekle, eski transaction'ları güncelle)
                let updatedFiles = currentData.files || [];
                if (updates.files !== undefined) { // Eğer files alanı güncellemelerde varsa
                    const newFilesToAdd = [];
                    // Güncellemedeki her dosyayı kontrol et
                    for (const incomingFile of updates.files) {
                        const existingFileIndex = updatedFiles.findIndex(f => f.id === incomingFile.id);
                        if (existingFileIndex > -1) {
                            // Mevcut dosya güncelleniyorsa
                            updatedFiles[existingFileIndex] = { ...updatedFiles[existingFileIndex], ...incomingFile };
                        } else {
                            // Yeni dosya ekleniyorsa
                            newFilesToAdd.push({ ...incomingFile, id: incomingFile.id || generateUUID() });
                        }
                    }
                    updatedFiles = updatedFiles.filter(existingFile => updates.files.some(incomingFile => incomingFile.id === existingFile.id)).concat(newFilesToAdd);
                    // Eğer `updates.files` içinde olmayan eski dosyalar silindiyse, onlar da kaldırılmalı.
                    // Bu mantık, updates.files'ın her zaman tam ve güncel listeyi içerdiğini varsayar.

                    // Yeni eklenen dosyalar için transaction oluştur
                    newFilesToAdd.forEach(newFile => {
                        const transactionType = newFile.indexingType || (newFile.parentTransactionId ? "Document Sub-Indexed" : "Document Indexed");
                        const transactionDescription = newFile.indexingName || newFile.name;

                        newTransactions.push({ 
                            transactionId: generateUUID(), 
                            type: transactionType, 
                            description: transactionDescription, 
                            documentId: newFile.id, 
                            documentName: newFile.name, 
                            documentDesignation: newFile.documentDesignation, 
                            subDesignation: newFile.subDesignation, 
                            timestamp: newFile.uploadedAt || timestamp, 
                            userId: user.uid, 
                            userEmail: user.email, 
                            parentId: newFile.parentTransactionId || null 
                        });
                    });
                }
                
                // Güncelleme nesnesinden 'files' özelliğini çıkar, çünkü yukarıda manuel olarak güncelledik
                const finalUpdates = { ...updates };
                delete finalUpdates.files;

                await updateDoc(recordRef, { 
                    ...finalUpdates, 
                    files: updatedFiles, // Güncellenmiş dosyalar dizisi
                    updatedAt: timestamp, 
                    transactions: newTransactions 
                });
                return { success: true };
            } catch (error) {
                console.error("Kayıt güncellenirken hata:", error);
                return { success: false, error: error.message || "Kayıt güncellenirken beklenmeyen bir hata oluştu." };
            }
        } else {
            let records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            let record = records.find(r => r.id === recordId);
            if (record) {
                // Dosya mantığı yerel depolamada daha karmaşık olabilir, basit bir atama yapalım
                if (updates.files !== undefined) {
                    record.files = updates.files;
                    delete updates.files;
                }
                Object.assign(record, updates, { updatedAt: timestamp });
                localStorage.setItem('ipRecords', JSON.stringify(records));
                return { success: true };
            }
            return { success: false, error: "Kayıt yerel depolamada bulunamadı." };
        }
    },
    async deleteRecord(recordId) {
        if (isFirebaseAvailable) {
            try {
                await deleteDoc(doc(db, 'ipRecords', recordId));
                return { success: true };
            } catch (error) {
                console.error("Kayıt silinirken hata:", error);
                return { success: false, error: error.message || "Kayıt silinirken beklenmeyen bir hata oluştu." };
            }
        } else {
            const records = JSON.parse(localStorage.getItem('ipRecords') || '[]').filter(r => r.id !== recordId);
            localStorage.setItem('ipRecords', JSON.stringify(records));
            return { success: true };
        }
    },
    async deleteTransaction(recordId, txId) {
        if (isFirebaseAvailable) {
            try {
                const recordRef = doc(db, 'ipRecords', recordId);
                const currentDoc = await getDoc(recordRef);
                if (!currentDoc.exists()) return { success: false, error: "Kayıt bulunamadı." };
                const transactions = currentDoc.data().transactions || [];
                const idsToDelete = new Set([txId, ...this.findAllDescendants(txId, transactions)]);
                const newTransactions = transactions.filter(tx => !idsToDelete.has(tx.transactionId));
                await updateDoc(recordRef, { transactions: newTransactions });
                return { success: true, remainingTransactions: newTransactions };
            } catch (error) {
                console.error("İşlem silinirken hata:", error);
                return { success: false, error: error.message || "İşlem silinirken beklenmeyen bir hata oluştu." };
            }
        }
        return { success: false, error: 'Yerel modda işlem silme desteklenmiyor.' };
    },
    async updateTransaction(recordId, txId, updates) {
        if (isFirebaseAvailable) {
            try {
                const recordRef = doc(db, 'ipRecords', recordId);
                const currentDoc = await getDoc(recordRef);
                if (!currentDoc.exists()) return { success: false, error: "Kayıt bulunamadı." };
                const transactions = currentDoc.data().transactions || [];
                const newTransactions = transactions.map(tx => tx.transactionId === txId ? { ...tx, ...updates, timestamp: new Date().toISOString() } : tx);
                await updateDoc(recordRef, { transactions: newTransactions });
                return { success: true };
            } catch (error) {
                console.error("İşlem güncellenirken hata:", error);
                return { success: false, error: error.message || "İşlem güncellenirken beklenmeyen bir hata oluştu." };
            }
        }
        return { success: false, error: 'Yerel modda işlem güncelleme desteklenmiyor.' };
    }
};

// --- Task Service (For Workflow Management) ---
export const taskService = {
    async createTask(taskData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İş oluşturulamaz." };
        try {
            const user = authService.getCurrentUser();
            const docRef = await addDoc(collection(db, 'tasks'), {
                ...taskData,
                createdBy_uid: user.uid,
                createdBy_email: user.email,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                history: [{
                    timestamp: new Date().toISOString(),
                    userId: user.uid,
                    userEmail: user.email,
                    action: `İş oluşturuldu ve ${taskData.assignedTo_email} kişisine atandı.`
                }]
            });
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error("İş oluşturulurken hata:", error);
            return { success: false, error: error.message || "İş oluşturulurken beklenmeyen bir hata oluştu." };
        }
    },
    
    async updateTask(taskId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İş güncellenemez." };
        try {
            const taskRef = doc(db, "tasks", taskId);
            const user = authService.getCurrentUser();
            
            let actionMessage = `İş güncellendi.`;
            if (updates.status) {
                actionMessage = `İş durumu "${updates.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}" olarak güncellendi.`;
            } else {
                const changedFields = Object.keys(updates).filter(key => key !== 'updatedAt' && key !== 'history' && key !== 'files');
                if (changedFields.length > 0) {
                    actionMessage = `İş güncellendi. Değişen alanlar: ${changedFields.join(', ')}.`;
                }
            }

            const updateAction = {
                timestamp: new Date().toISOString(),
                userId: user.uid,
                userEmail: user.email,
                action: actionMessage
            };
            
            const currentTaskDoc = await getDoc(taskRef);
            const currentTaskData = currentTaskDoc.data();

            let updatedFilesArray = currentTaskData.files || [];
            if (updates.files !== undefined) { // Eğer files alanı güncellemelerde varsa
                const newFilesToAdd = [];
                for (const incomingFile of updates.files) {
                    const existingFileIndex = updatedFilesArray.findIndex(f => f.id === incomingFile.id);
                    if (existingFileIndex > -1) {
                        updatedFilesArray[existingFileIndex] = { ...updatedFilesArray[existingFileIndex], ...incomingFile };
                    } else {
                        newFilesToAdd.push({ ...incomingFile, id: incomingFile.id || generateUUID() });
                    }
                }
                updatedFilesArray = updatedFilesArray.filter(existingFile => updates.files.some(incomingFile => incomingFile.id === existingFile.id)).concat(newFilesToAdd);
            }
            
            const finalUpdates = { ...updates };
            delete finalUpdates.files; // files alanını manuel olarak işledik

            await updateDoc(taskRef, {
                ...finalUpdates,
                files: updatedFilesArray, // Güncellenmiş dosyalar dizisi
                updatedAt: new Date().toISOString(),
                history: arrayUnion(updateAction)
            });
            return { success: true };
        } catch (error) {
            console.error("İş güncellenirken hata:", error);
            return { success: false, error: error.message || "İş güncellenirken beklenmeyen bir hata oluştu." };
        }
    },

    async getTasksForUser(userId) {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'tasks'), where('assignedTo_uid', '==', userId), orderBy('dueDate', 'asc'));
            const querySnapshot = await getDocs(q);
            const tasks = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            return { success: true, data: tasks };
        } catch (error) {
            console.error("Kullanıcı için işler alınırken hata:", error);
            return { success: false, error: error.message || "İşler yüklenirken beklenmeyen bir hata oluştu.", data: [] };
        }
    },

    async getAllTasks() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const tasks = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            return { success: true, data: tasks };
        } catch (error) {
            console.error("Tüm işler alınırken hata:", error);
            return { success: false, error: error.message || "İşler yüklenirken beklenmeyen bir hata oluştu.", data: [] };
        }
    },

    async getTaskById(taskId) {
        if (!isFirebaseAvailable) {
            const allTasks = JSON.parse(localStorage.getItem('tasks') || '[]');
            const task = allTasks.find(t => t.id === taskId);
            return { success: !!task, data: task, error: task ? undefined : "İş yerel depolamada bulunamadı." };
        }
        try {
            const taskDoc = await getDoc(doc(db, 'tasks', taskId));
            if (taskDoc.exists()) {
                return { success: true, data: { id: taskDoc.id, ...taskDoc.data() } };
            } else {
                return { success: false, error: "İş bulunamadı." };
            }
        } catch (error) {
            console.error("İş ID ile alınırken hata:", error);
            return { success: false, error: error.message || "İş yüklenirken beklenmeyen bir hata oluştu." };
        }
    },

    async deleteTask(taskId) {
        if (!isFirebaseAvailable) {
            let tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
            const taskToDelete = tasks.find(t => t.id === taskId);
            if (taskToDelete && taskToDelete.relatedIpRecordId && taskToDelete.transactionIdForDeletion) {
                // Yerel modda deleteTransaction desteklenmediği için uyarı
                console.warn("Yerel modda ilgili IP kaydından işlem silme desteklenmiyor.");
            }
            tasks = tasks.filter(task => task.id !== taskId);
            localStorage.setItem('tasks', JSON.stringify(tasks));
            return { success: true };
        }
        try {
            const taskDoc = await getDoc(doc(db, 'tasks', taskId));
            if (taskDoc.exists()) {
                const taskData = taskDoc.data();
                if (taskData.relatedIpRecordId && taskData.transactionIdForDeletion) {
                    await ipRecordsService.deleteTransaction(taskData.relatedIpRecordId, taskData.transactionIdForDeletion);
                }
            }
            await deleteDoc(doc(db, 'tasks', taskId));
            return { success: true };
        } catch (error) {
            console.error("İş silinirken hata:", error);
            return { success: false, error: error.message || "İş silinirken beklenmeyen bir hata oluştu." };
        }
    },
    
    async reassignTasks(taskIds, newUserId, newUserEmail) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşler atanamaz." };
        
        const user = authService.getCurrentUser();
        if (!user) return { success: false, error: "Kullanıcı girişi yapılmamış." };

        const batch = writeBatch(db);

        const actionMessage = `İş, ${user.email} tarafından ${newUserEmail} kullanıcısına atandı.`;
        const updateAction = {
            timestamp: new Date().toISOString(),
            userId: user.uid,
            userEmail: user.email,
            action: actionMessage
        };

        taskIds.forEach(taskId => {
            const taskRef = doc(db, "tasks", taskId);
            batch.update(taskRef, {
                assignedTo_uid: newUserId,
                assignedTo_email: newUserEmail,
                updatedAt: new Date().toISOString(),
                history: arrayUnion(updateAction)
            });
        });

        try {
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error("Toplu iş ataması sırasında hata:", error);
            return { success: false, error: error.message || "Toplu iş ataması sırasında beklenmeyen bir hata oluştu." };
        }
    },

    async getAllUsers() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));
            const querySnapshot = await getDocs(q);
            const users = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            return { success: true, data: users };
        } catch (error) {
            console.error("Tüm kullanıcılar alınırken hata:", error);
            return { success: false, error: error.message || "Kullanıcılar yüklenirken beklenmeyen bir hata oluştu.", data: [] };
        }
    }
};

// --- Accrual Service ---
export const accrualService = {
    async addAccrual(accrualData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. Tahakkuk eklenemez." };
        const user = authService.getCurrentUser();
        if (!user) return { success: false, error: "Kullanıcı girişi yapılmamış." };
        
        try {
            const newAccrual = {
                ...accrualData,
                id: generateUUID(),
                status: 'unpaid', // Default status
                createdAt: new Date().toISOString(),
                createdBy_uid: user.uid,
                createdBy_email: user.email,
                files: (accrualData.files || []).map(f => ({ ...f, id: f.id || generateUUID() })), // Dosyalara da ID ata
                paymentDate: null // Ödeme tarihi eklendi
            };
            await setDoc(doc(db, 'accruals', newAccrual.id), newAccrual);
            return { success: true, data: newAccrual };
        } catch (error) {
            console.error("Tahakkuk oluşturulurken hata:", error);
            return { success: false, error: error.message || "Tahakkuk oluşturulurken beklenmeyen bir hata oluştu." };
        }
    },

    async getAccruals() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'accruals'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(d => ({id: d.id, ...d.data()})) };
        } catch (error) {
            console.error("Tahakkuklar alınırken hata:", error);
            return { success: false, error: error.message || "Tahakkuklar yüklenirken beklenmeyen bir hata oluştu.", data: [] };
        }
    },

    async updateAccrual(accrualId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. Tahakkuk güncellenemez." };
        try {
            const accrualRef = doc(db, 'accruals', accrualId);
            const currentAccrualDoc = await getDoc(accrualRef);
            if (!currentAccrualDoc.exists()) {
                return { success: false, error: "Tahakkuk bulunamadı." };
            }
            const currentAccrualData = currentAccrualDoc.data();

            let updatedFiles = currentAccrualData.files || [];
            if (updates.files !== undefined) {
                const newFilesToAdd = [];
                // incoming files içinde eski id'li olanlar varsa, mevcutları güncelleriz.
                // yeni id'li olanlar varsa, onları ekleriz.
                for (const incomingFile of updates.files) {
                    const existingFileIndex = updatedFiles.findIndex(f => f.id === incomingFile.id);
                    if (existingFileIndex > -1) {
                        updatedFiles[existingFileIndex] = { ...updatedFiles[existingFileIndex], ...incomingFile };
                    } else {
                        newFilesToAdd.push({ ...incomingFile, id: incomingFile.id || generateUUID() });
                    }
                }
                // updates.files içinde olmayan ve updatedFiles içinde kalanları temizle
                updatedFiles = updatedFiles.filter(existingFile => updates.files.some(incomingFile => incomingFile.id === existingFile.id)).concat(newFilesToAdd);
            }
            
            const finalUpdates = { ...updates };
            delete finalUpdates.files; // Dosya güncellemelerini manuel olarak işledik

            await updateDoc(accrualRef, {
                ...finalUpdates,
                files: updatedFiles // Güncellenmiş dosyalar dizisini kaydet
            });
            return { success: true };
        } catch (error) {
            console.error("Tahakkuk güncellenirken hata:", error);
            return { success: false, error: error.message || "Tahakkuk güncellenirken beklenmeyen bir hata oluştu." };
        }
    }
};


// --- Demo Data Function ---
export async function createDemoData() {
    console.log('🧪 Demo verisi oluşturuluyor...');
    const user = authService.getCurrentUser();
    if (!user) {
        console.error('Demo verisi oluşturmak için kullanıcı girişi yapılmamış.');
        return;
    }

    try {
        const demoPersonEmail = `demo.owner.${Date.now()}@example.com`;
        const demoPerson = {
            name: 'Demo Hak Sahibi',
            type: 'individual',
            email: demoPersonEmail,
            phone: '0555 123 4567',
            address: 'Demo Adres, No:1, İstanbul'
        };
        const personResult = await personsService.addPerson(demoPerson);
        if (!personResult.success) {
            console.error("Demo kişi oluşturulamadı:", personResult.error);
            return;
        }
        const demoOwner = { id: personResult.data.id, name: personResult.data.name, type: personResult.data.type, email: personResult.data.email };

        const demoRecords = [
            {
                type: 'patent',
                title: 'Örnek Mobil Cihaz Batarya Teknolojisi',
                status: 'application',
                applicationNumber: 'PT/2024/001',
                applicationDate: '2024-03-15',
                description: 'Bu, lityum-iyon pillerin ömrünü uzatan yeni bir batarya teknolojisi için yapılmış bir demo patent başvurusudur.',
                owners: [demoOwner]
            },
            {
                type: 'trademark',
                title: 'Hızlı Kargo Lojistik',
                status: 'registered',
                applicationNumber: 'TM/2023/105',
                applicationDate: '2023-11-20',
                registrationDate: '2024-05-10',
                description: 'Lojistik ve kargo hizmetleri için tescilli bir marka demosu.',
                owners: [demoOwner],
                trademarkImage: {
                    name: 'logo_ornek.jpg',
                    type: 'image/jpeg',
                    size: 1024,
                    content: 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
                },
                renewalDate: '2025-06-15' // Örnek yenileme tarihi eklendi
            }
        ];

        for (const record of demoRecords) {
            const addRecordResult = await ipRecordsService.addRecord(record);
            if (!addRecordResult.success) {
                console.error("Demo kayıt oluşturulamadı:", addRecordResult.error);
            }
        }
        console.log('✅ Demo verisi başarıyla oluşturuldu!');

    } catch (error) {
        console.error('Demo verisi oluşturulurken hata:', error);
    }
}


// --- Exports ---
export { subDesignationTranslations, documentDesignationTranslations };
export { auth, db, generateUUID };