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
            return null;
        }
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (!userDoc.exists()) {
                console.warn(`Firestore'da ${uid} için kullanıcı belgesi bulunamadı. Varsayılan rol 'user' olarak atanıyor.`);
                return 'user';
            }
            return userDoc.data().role;
        } catch (error) {
            console.error("Kullanıcı rolü alınırken hata:", error);
            return null;
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
            const role = await this.getUserRole(user.uid) || 'user';
            const userData = { uid: user.uid, email: user.email, displayName: user.displayName, role, isSuperAdmin: role === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData, message: "Giriş başarılı!" };
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
            if (!setRoleResult.success) throw new Error(setRoleResult.error);
            
            const userData = { uid: user.uid, email, displayName, role: initialRole, isSuperAdmin: initialRole === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData, message: "Kayıt başarılı!" };
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
            } catch (error) {
                console.error("Firebase oturumu kapatılırken hata:", error);
            }
        }
        localStorage.removeItem('currentUser');
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
                return { success: false, error: error.message };
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
            try {
                const q = query(collection(db, 'persons'), orderBy('name'));
                const snapshot = await getDocs(q);
                return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
            } catch (error) {
                return { success: false, error: error.message };
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
                return { success: false, error: error.message };
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
                return { success: false, error: error.message };
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
    async addRecord(record) {
        if (!isFirebaseAvailable) {
            const records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            const newRecord = { ...record, id: generateUUID(), createdAt: new Date().toISOString() };
            records.push(newRecord);
            localStorage.setItem('ipRecords', JSON.stringify(records));
            return { success: true, id: newRecord.id };
        }
        try {
            const docRef = await addDoc(collection(db, 'ipRecords'), { ...record, createdAt: new Date().toISOString() });
            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getRecords() {
        if (!isFirebaseAvailable) {
            const records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            return { success: true, data: records };
        }
        try {
            const snapshot = await getDocs(collection(db, 'ipRecords'));
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getRecordById(recordId) {
        if (!isFirebaseAvailable) {
            const records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            const record = records.find(r => r.id === recordId);
            return record ? { success: true, data: record } : { success: false, error: "Kayıt yerel depolamada bulunamadı." };
        }
        try {
            const docRef = doc(db, "ipRecords", recordId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
            } else {
                return { success: false, error: "Kayıt bulunamadı." };
            }
        } catch (error) {
            console.error("Error getting record by ID: ", error);
            return { success: false, error: error.message };
        }
    },
    async updateRecord(recordId, updates) {
        if (!isFirebaseAvailable) {
            let records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            const index = records.findIndex(r => r.id === recordId);
            if (index > -1) {
                records[index] = { ...records[index], ...updates };
                localStorage.setItem('ipRecords', JSON.stringify(records));
                return { success: true };
            }
            return { success: false, error: "Kayıt yerel depolamada bulunamadı." };
        }
        try {
            // updateRecord zaten files'ı doğrudan güncelleyebilir, arrayUnion/arrayRemove gibi
            // eklemeler/silmeler için addFileToRecord veya deleteFileFromRecord kullanmak daha mantıklı.
            await updateDoc(doc(db, 'ipRecords', recordId), updates);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async deleteRecord(recordId) {
        if (!isFirebaseAvailable) {
            const records = JSON.parse(localStorage.getItem('ipRecords') || '[]').filter(r => r.id !== recordId);
            localStorage.setItem('ipRecords', JSON.stringify(records));
            return { success: true };
        }
        try {
            await deleteDoc(doc(db, 'ipRecords', recordId));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    // addTransactionToRecord: Sadece işlem (olay) kaydı için
    async addTransactionToRecord(recordId, transactionData) {
        if (!isFirebaseAvailable) {
            let records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            const recordIndex = records.findIndex(r => r.id === recordId);
            if (recordIndex > -1) {
                if (!records[recordIndex].transactions) {
                    records[recordIndex].transactions = [];
                }
                const user = authService.getCurrentUser();
                const newTransaction = {
                    ...transactionData,
                    transactionId: generateUUID(),
                    timestamp: new Date().toISOString(),
                    userId: user.uid,
                    userEmail: user.email,
                    transactionType: transactionData.transactionType || 'Genel İşlem', 
                    transactionHierarchy: transactionData.transactionHierarchy || 'parent', 
                    parentId: transactionData.parentId || null 
                };
                records[recordIndex].transactions.push(newTransaction);
                localStorage.setItem('ipRecords', JSON.stringify(records));
                return { success: true, data: newTransaction }; 
            }
            return { success: false, error: "Record not found in local storage." };
        }
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const user = authService.getCurrentUser();
            const newTransaction = {
                ...transactionData,
                transactionId: generateUUID(),
                timestamp: new Date().toISOString(),
                userId: user.uid,
                userEmail: user.email,
                transactionType: transactionData.transactionType || 'Genel İşlem', 
                transactionHierarchy: transactionData.transactionHierarchy || 'parent', 
                parentId: transactionData.parentId || null 
            };
            await updateDoc(recordRef, {
                transactions: arrayUnion(newTransaction)
            });
            return { success: true, data: newTransaction }; 
        } catch (error) {
            console.error("Error adding transaction to record:", error);
            return { success: false, error: error.message };
        }
    },
    // Yeni fonksiyon: addFileToRecord - Doküman kaydı için
    async addFileToRecord(recordId, fileData) {
        if (!isFirebaseAvailable) {
            let records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            const recordIndex = records.findIndex(r => r.id === recordId);
            if (recordIndex > -1) {
                if (!records[recordIndex].files) {
                    records[recordIndex].files = [];
                }
                const user = authService.getCurrentUser();
                const newFile = {
                    ...fileData,
                    fileId: generateUUID(), // Dosya için benzersiz ID
                    uploadedAt: new Date().toISOString(),
                    uploadedBy_uid: user.uid,
                    uploadedBy_email: user.email,
                    // Eğer dosya bir işlemle ilişkiliyse
                    relatedTransactionId: fileData.relatedTransactionId || null 
                };
                records[recordIndex].files.push(newFile);
                localStorage.setItem('ipRecords', JSON.stringify(records));
                return { success: true, data: newFile };
            }
            return { success: false, error: "Record not found in local storage for file addition." };
        }
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const user = authService.getCurrentUser();
            const newFile = {
                ...fileData,
                fileId: generateUUID(),
                uploadedAt: new Date().toISOString(),
                uploadedBy_uid: user.uid,
                uploadedBy_email: user.email,
                relatedTransactionId: fileData.relatedTransactionId || null 
            };
            await updateDoc(recordRef, {
                files: arrayUnion(newFile)
            });
            return { success: true, data: newFile };
        } catch (error) {
            console.error("Error adding file to record:", error);
            return { success: false, error: error.message };
        }
    },
    // Doküman silme fonksiyonu (isteğe bağlı)
    async deleteFileFromRecord(recordId, fileId) {
        if (!isFirebaseAvailable) {
            console.warn("Local storage file deletion not implemented.");
            return { success: true }; 
        }
        try {
            const recordRef = doc(db, "ipRecords", recordId);
            const recordSnap = await getDoc(recordRef);
            if (recordSnap.exists()) {
                const recordData = recordSnap.data();
                const files = recordData.files || [];
                const updatedFiles = files.filter(f => f.fileId !== fileId);
                await updateDoc(recordRef, { files: updatedFiles });
                return { success: true };
            } else {
                return { success: false, error: "Record not found." };
            }
        } catch (error) {
            console.error("Error deleting file from record:", error);
            return { success: false, error: error.message };
        }
    },

    // Mevcut deleteTransaction fonksiyonu - Doküman silme mantığı içermez
    async deleteTransaction(recordId, transactionId) {
        if (!isFirebaseAvailable) {
            console.warn("Local storage transaction deletion not implemented.");
            return { success: true }; 
        }
        try {
            const recordRef = doc(db, "ipRecords", recordId);
            const recordSnap = await getDoc(recordRef);
            if (recordSnap.exists()) {
                const recordData = recordSnap.data();
                const transactions = recordData.transactions || [];
                const updatedTransactions = transactions.filter(tx => tx.transactionId !== transactionId);
                await updateDoc(recordRef, { transactions: updatedTransactions });
                
                // NOT: Eğer bir işlem silindiğinde o işlemle ilişkili dosyaların da silinmesini istiyorsanız,
                // burada ek bir mantık eklemeniz gerekir. Örneğin:
                // await ipRecordsService.deleteFilesRelatedToTransaction(recordId, transactionId);
                
                return { success: true };
            } else {
                return { success: false, error: "Record not found." };
            }
        } catch (error) {
            console.error("Error deleting transaction:", error);
            return { success: false, error: error.message };
        }
    },
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
            // NOT: files alanı artık addFileToRecord ile yönetilmeli.
            // Bu updateTask fonksiyonu genel güncellemeler için kalsın.
            if (updates.files !== undefined) {
                // Burada mevcut dosyalara updates.files içindeki dosyaları eklememelisiniz
                // çünkü bu update sadece mevcut dosyaların güncellenmesini veya tamamen değiştirilmesini sağlar.
                // Yeni dosya eklemek için addFileToRecord kullanılmalı.
                // Bu kısmı sadece dosyaların tamamının güncellenmesi gerektiğinde kullanın.
                updatedFilesArray = updates.files; 
            }
            
            const finalUpdates = { ...updates };
            delete finalUpdates.files; // files'ı doğrudan güncellemek yerine addFileToRecord kullanın

            await updateDoc(taskRef, {
                ...finalUpdates,
                files: updatedFilesArray, // Eğer bu alanda bir güncelleme gelirse yaz.
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
                    // İşlemle ilişkili dosyaları da silmek isterseniz burada mantık ekleyin
                    // Örneğin: await ipRecordsService.deleteFilesRelatedToTransaction(taskData.relatedIpRecordId, taskData.transactionIdForDeletion);
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
                status: 'unpaid',
                createdAt: new Date().toISOString(),
                createdBy_uid: user.uid,
                createdBy_email: user.email,
                files: (accrualData.files || []).map(f => ({ ...f, id: f.id || generateUUID() })),
                paymentDate: null
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
            // Not: Accrual service'de de files'ı addFileToRecord benzeri bir fonksiyonla yönetebilirsiniz.
            // Şimdilik updateAccrual içindeki files yönetimi mevcut şekliyle bırakıldı.
            if (updates.files !== undefined) {
                const newFilesToAdd = [];
                for (const incomingFile of updates.files) {
                    const existingFileIndex = updatedFiles.findIndex(f => f.id === incomingFile.id);
                    if (existingFileIndex > -1) {
                        updatedFiles[existingFileIndex] = { ...updatedFiles[existingFileIndex], ...incomingFile };
                    } else {
                        newFilesToAdd.push({ ...incomingFile, id: incomingFile.id || generateUUID() });
                    }
                }
                updatedFiles = updatedFiles.filter(existingFile => updates.files.some(incomingFile => incomingFile.id === existingFile.id)).concat(newFilesToAdd);
            }
            
            const finalUpdates = { ...updates };
            delete finalUpdates.files;

            await updateDoc(accrualRef, {
                ...finalUpdates,
                files: updatedFiles
            });
            return { success: true };
        } catch (error) {
            console.error("Tahakkuk güncellenirken hata:", error);
            return { success: false, error: error.message || "Tahakkuk güncellenirken beklenmeyen bir hata oluştu." };
        }
    }
};

// --- Demo Data Function ---
// GÜNCELLENMİŞ createDemoData FONKSİYONU
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
            personType: 'real',
            firstName: 'Demo',
            lastName: 'Hak Sahibi',
            name: 'Demo Hak Sahibi',
            email: demoPersonEmail,
            phone: '0555 123 4567',
            address: 'Demo Adres, No:1, İstanbul',
            country: 'Türkiye',
            city: 'İstanbul'
        };
        const personResult = await personsService.addPerson(demoPerson);
        if (!personResult.success) {
            console.error("Demo kişi oluşturulamadı:", personResult.error);
            return;
        }
        const demoOwner = { 
            id: personResult.data.id, 
            name: personResult.data.name, 
            personType: personResult.data.personType,
            email: personResult.data.email 
        };

        const demoRecords = [
            {
                type: 'patent',
                title: 'Örnek Mobil Cihaz Batarya Teknolojisi',
                status: 'application',
                applicationNumber: 'PT/2024/001',
                applicationDate: '2024-03-15',
                description: 'Bu, lityum-iyon pillerin ömrünü uzatan yeni bir batarya teknolojisi için yapılmış bir demo patent başvurusudur.',
                owners: [demoOwner],
                transactions: [], 
                files: [] // Dosyalar için de başlangıçta boş dizi
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
                renewalDate: '2025-06-15',
                transactions: [], 
                files: [] // Dosyalar için de başlangıçta boş dizi
            }
        ];

        for (const record of demoRecords) {
            const addRecordResult = await ipRecordsService.addRecord(record);
            if (!addRecordResult.success) {
                console.error("Demo kayıt oluşturulamadı:", addRecordResult.error);
                continue; 
            }

            let parentTransaction;

            if (record.type === 'patent') {
                // Patent Başvurusu (PARENT İşlem)
                const patentAppResult = await ipRecordsService.addTransactionToRecord(addRecordResult.id, {
                    designation: 'Patent Başvurusu Yapıldı',
                    transactionType: 'Başvuru', 
                    transactionHierarchy: 'parent', 
                    date: '2024-03-15',
                    notes: 'Patent başvurusu ilgili kuruma yapıldı.'
                });
                if (patentAppResult.success) parentTransaction = patentAppResult.data;

                // Patent Başvurusu ile İlişkili Ek Doküman (Files)
                if (parentTransaction && parentTransaction.transactionId) {
                    await ipRecordsService.addFileToRecord(addRecordResult.id, {
                        fileName: 'PatentBasvuruFormu.pdf',
                        fileType: 'application/pdf',
                        fileSize: 1.2 * 1024 * 1024, // 1.2 MB
                        fileUrl: 'https://example.com/patent-form.pdf', // Örnek URL
                        relatedTransactionId: parentTransaction.transactionId, // Hangi işlemle ilişkili
                        documentDesignation: 'Başvuru Ek Dokümanı'
                    });

                    // Patent Başvurusu altında bir İtiraz Süreci (CHILD İşlem)
                    const oppositionTransResult = await ipRecordsService.addTransactionToRecord(addRecordResult.id, {
                        designation: 'İtiraz Başvurusu',
                        transactionType: 'İtiraz',
                        transactionHierarchy: 'child',
                        parentId: parentTransaction.transactionId,
                        date: '2024-04-01',
                        notes: 'Üçüncü taraf itirazı kaydedildi.'
                    });
                    if (oppositionTransResult.success) {
                        // İtiraz Başvurusu ile İlişkili Doküman (Files)
                        await ipRecordsService.addFileToRecord(addRecordResult.id, {
                            fileName: 'ItirazDilekcesi.pdf',
                            fileType: 'application/pdf',
                            fileSize: 0.8 * 1024 * 1024, // 0.8 MB
                            fileUrl: 'https://example.com/itiraz-dilekcesi.pdf', // Örnek URL
                            relatedTransactionId: oppositionTransResult.data.transactionId, // Hangi işlemle ilişkili
                            documentDesignation: 'Resmi Yazışma'
                        });

                        // İtiraza Cevap Sunuldu (CHILD İşlem, İtiraz işlemine bağlı)
                        await ipRecordsService.addTransactionToRecord(addRecordResult.id, {
                            designation: 'İtiraza Cevap Sunuldu',
                            transactionType: 'Cevap',
                            transactionHierarchy: 'child',
                            parentId: oppositionTransResult.data.transactionId, 
                            date: '2024-05-01',
                            notes: 'İtiraza karşı cevap verildi.'
                        });
                    }
                }

            } else if (record.type === 'trademark') {
                // Marka Başvurusu (PARENT İşlem)
                const trademarkAppResult = await ipRecordsService.addTransactionToRecord(addRecordResult.id, {
                    designation: 'Marka Başvurusu Yapıldı',
                    transactionType: 'Başvuru',
                    transactionHierarchy: 'parent',
                    date: '2023-11-20',
                    notes: 'Marka için ilk başvuru yapıldı.'
                });
                if (trademarkAppResult.success) parentTransaction = trademarkAppResult.data;

                // Marka Başvurusu ile İlişkili Görsel (Files)
                if (parentTransaction && parentTransaction.transactionId) {
                    await ipRecordsService.addFileToRecord(addRecordResult.id, {
                        fileName: 'logo_hizli_kargo.png',
                        fileType: 'image/png',
                        fileSize: 0.15 * 1024 * 1024, // 0.15 MB
                        fileUrl: 'https://example.com/logo-kargo.png', // Örnek URL
                        relatedTransactionId: parentTransaction.transactionId,
                        documentDesignation: 'Teknik Çizim' // Marka görseli gibi
                    });

                    // Yenileme İşlemi (AYRI BİR PARENT İşlem)
                    const renewalTransResult = await ipRecordsService.addTransactionToRecord(addRecordResult.id, {
                        designation: 'Yenileme İşlemi Başlatıldı',
                        transactionType: 'Yenileme',
                        transactionHierarchy: 'parent', 
                        date: '2024-06-01',
                        notes: 'Marka tescilinin yenileme süreci başlatıldı.'
                    });

                    // Yenileme işlemi altında "Ret Kararı" (CHILD İşlem)
                    if (renewalTransResult.success && renewalTransResult.data.transactionId) {
                        const rejectionTransResult = await ipRecordsService.addTransactionToRecord(addRecordResult.id, {
                            designation: 'Yenileme Ret Kararı',
                            transactionType: 'Ret Kararı',
                            transactionHierarchy: 'child',
                            parentId: renewalTransResult.data.transactionId, // Yenileme işlemine bağlı
                            date: '2024-06-15',
                            notes: 'Yenileme başvurusu reddedildi.'
                        });
                        if (rejectionTransResult.success) {
                            // Ret Kararı ile İlişkili Doküman (Files)
                            await ipRecordsService.addFileToRecord(addRecordResult.id, {
                                fileName: 'YenilemeRetKarari.pdf',
                                fileType: 'application/pdf',
                                fileSize: 0.5 * 1024 * 1024, // 0.5 MB
                                fileUrl: 'https://example.com/renewal-rejection.pdf', // Örnek URL
                                relatedTransactionId: rejectionTransResult.data.transactionId, // Hangi işlemle ilişkili
                                documentDesignation: 'Ret Kararı' // Doküman tipi
                            });
                        }
                    }
                }
            }
        }
        console.log('✅ Demo verisi başarıyla oluşturuldu!');

    } catch (error) {
        console.error('Demo verisi oluşturulurken hata:', error);
    }
}


// --- Exports ---
export { auth, db };