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
    isFirebaseAvailable = false;
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
                    case 'auth/invalid-credential':
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
            const user = authService.getCurrentUser();
            if(!user) return {success: true, data:[]};
            try {
                const q = user.role === 'superadmin' ? query(collection(db, 'persons'), orderBy('name')) : query(collection(db, 'persons'), where('userId', '==', user.uid), orderBy('name'));
                const snapshot = await getDocs(q);
                return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
            } catch (error) {
                console.error("Kişiler alınırken hata:", error);
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
        if (!isFirebaseAvailable) return { success: true, data: JSON.parse(localStorage.getItem('ipRecords') || '[]') };
        try {
            const snapshot = await getDocs(collection(db, 'ipRecords'));
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    // EKSİK FONKSİYON BURAYA EKLENDİ
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
                let recordData = { id: docSnap.id, ...docSnap.data() };
                if (recordData.owners && recordData.owners.length > 0) {
                    const allPersonsResult = await personsService.getPersons();
                    if (allPersonsResult.success) {
                        const allPersonsMap = new Map(allPersonsResult.data.map(p => [p.id, p]));
                        recordData.owners = recordData.owners.map(ownerRef => allPersonsMap.get(ownerRef.id) || ownerRef);
                    }
                }
                return { success: true, data: recordData };
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
    async addTransactionToRecord(recordId, transactionData) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Kullanıcı girişi yapılmamış."};
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşlem eklenemez." };
        
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const newTransaction = {
                transactionId: generateUUID(),
                timestamp: new Date().toISOString(),
                userId: user.uid,
                userEmail: user.email,
                ...transactionData 
            };

            await updateDoc(recordRef, {
                transactions: arrayUnion(newTransaction), 
                updatedAt: new Date().toISOString()
            });
            return { success: true, transaction: newTransaction };
        } catch (error) {
            console.error("Kayda işlem eklenirken hata:", error);
            return { success: false, error: error.message };
        }
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
            return { success: false, error: error.message };
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
            }
            
            const updateAction = {
                timestamp: new Date().toISOString(),
                userId: user.uid,
                userEmail: user.email,
                action: actionMessage
            };
            
            await updateDoc(taskRef, {
                ...updates,
                updatedAt: new Date().toISOString(),
                history: arrayUnion(updateAction)
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
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
            return { success: false, error: error.message };
        }
    }
};

export { auth, db };