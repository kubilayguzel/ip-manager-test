import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {getFirestore, collection, addDoc, 
        getDocs, doc, updateDoc, deleteDoc, 
        query, orderBy, where, getDoc, setDoc, arrayUnion, writeBatch, documentId, Timestamp, FieldValue } 
from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js'; // YENİ EKLENDİ

// --- Firebase App Initialization ---
const firebaseConfig = {
  apiKey: "AIzaSyDbdqfiVbobnl1BtyiWxhD4bfIcREw8ZRc",
  authDomain: "ip-manager-production-aab4b.firebaseapp.com",
  projectId: "ip-manager-production-aab4b",
  storageBucket: "ip-manager-production-aab4b.firebasestorage.app",
  messagingSenderId: "594650169512",
  appId: "1:594650169512:web:43496005e063a40511829d",
  measurementId: "G-QY1P3ZCMC4"
};

let app, auth, db, storage; // 'storage' değişkenini buraya ekledik
let isFirebaseAvailable = false;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app); // Firebase Storage'ı başlattık
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
        window.location.href = 'index.html';
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

// --- IP Records Service ---
export const ipRecordsService = {
    async addRecord(record) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const docRef = await addDoc(collection(db, 'ipRecords'), { ...record, createdAt: new Date().toISOString() });
            return { success: true, id: docRef.id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getRecords() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const snapshot = await getDocs(query(collection(db, 'ipRecords'), orderBy('createdAt', 'desc')));
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getRecordTransactions(recordId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşlem geçmişi alınamaz." };
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const transactionsCollectionRef = collection(recordRef, 'transactions');
            // Transaction'ları zaman damgasına göre azalan sırada (en yeni en üstte) sıralayalım
            const q = query(transactionsCollectionRef, orderBy('timestamp', 'desc'));
            const querySnapshot = await getDocs(q);
            
            const transactions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, data: transactions };
        } catch (error) {
            console.error("IP kaydı işlem geçmişi yüklenirken hata:", error);
            return { success: false, error: error.message };
        }
    },

    async getTransactionsForRecord(recordId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const transactionsRef = collection(db, 'ipRecords', recordId, 'transactions');
            const q = query(transactionsRef, orderBy('timestamp', 'asc')); // İşlemleri zamana göre sırala
            const querySnapshot = await getDocs(q);
            const transactions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return { success: true, transactions: transactions };
        } catch (error) {
            console.error("Kayda ait transaction'lar getirilirken hata:", error);
            return { success: false, error: error.message };
        }
    },
    async getRecordById(recordId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const docRef = doc(db, "ipRecords", recordId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { success: true, data: { id: docSnap.id, ...docSnap.data() } } : { success: false, error: "Kayıt bulunamadı." };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async updateRecord(recordId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await updateDoc(doc(db, 'ipRecords', recordId), { ...updates, updatedAt: new Date().toISOString() });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async deleteRecord(recordId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await deleteDoc(doc(db, 'ipRecords', recordId));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async addTransactionToRecord(recordId, transactionData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const transactionsCollectionRef = collection(recordRef, 'transactions');

            const currentUser = auth.currentUser; // Mevcut kullanıcıyı al
            let userName = 'Bilinmeyen Kullanıcı'; // Varsayılan değer

            if (currentUser) {
                // Kullanıcının görünen adını al, yoksa emailini kullan
                userName = currentUser.displayName || currentUser.email; 
            }

            const transactionToAdd = {
                ...transactionData,
                timestamp: new Date().toISOString(),
                userId: currentUser ? currentUser.uid : 'anonymous', 
                userEmail: currentUser ? currentUser.email : 'anonymous@example.com',
                userName: userName 
            };

            const docRef = await addDoc(transactionsCollectionRef, transactionToAdd);
            return { success: true, id: docRef.id, data: transactionToAdd };
        } catch (error) {
            console.error("Transaction alt koleksiyona eklenirken hata:", error);
            return { success: false, error: error.message };
        }
    },
    async addFileToRecord(recordId, fileData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const user = authService.getCurrentUser(); 
            const userEmail = user ? user.email : 'anonymous@example.com'; 
            const newFile = {
                ...fileData,
                id: generateUUID(),
                uploadedAt: new Date().toISOString(),
                userEmail: userEmail 
            };
            await updateDoc(recordRef, { files: arrayUnion(newFile) });
            return { success: true, data: newFile };
        } catch (error) {
            console.error("Error in addFileToRecord:", error); 
            return { success: false, error: error.message };
        }
    },
};

// --- YENİ EKLENDİ: Persons Service ---
export const personService = {
    async getPersons() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'persons'), orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async addPerson(personData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const id = generateUUID();
            const newPerson = {
                ...personData,
                id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'persons', id), newPerson);
            return { success: true, data: newPerson };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async updatePerson(personId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await updateDoc(doc(db, 'persons', personId), { ...updates, updatedAt: new Date().toISOString() });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async deletePerson(personId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await deleteDoc(doc(db, 'persons', personId));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// --- YENİ EKLENDİ: Task Service ---
export const taskService = {
    async createTask(taskData) { 
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        const user = authService.getCurrentUser();
        try {
            const id = await getNextTaskId();
            const newTask = {
                ...taskData,
                id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: { uid: user.uid, email: user.email },
                history: [{
                    timestamp: new Date().toISOString(),
                    action: 'İş oluşturuldu.',
                    userEmail: user.email
                }]
            };

            if (newTask.officialDueDate instanceof Date) {
                newTask.officialDueDate = Timestamp.fromDate(newTask.officialDueDate);
            }

            await setDoc(doc(db, "tasks", id), newTask);
            return { success: true, id };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getAllTasks() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getTaskById(taskId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const docRef = doc(db, "tasks", taskId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { success: true, data: { id: docSnap.id, ...docSnap.data() } } : { success: false, error: "Görev bulunamadı." };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getTasksForUser(userId) {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, "tasks"), where("assignedTo_uid", "==", userId), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async updateTask(taskId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        const user = authService.getCurrentUser();
        try {
            const taskRef = doc(db, "tasks", taskId);
            const newHistoryEntry = {
                timestamp: new Date().toISOString(),
                action: `İş güncellendi. Değişen alanlar: ${Object.keys(updates).join(', ')}`,
                userEmail: user.email
            };

            if (updates.officialDueDate instanceof Date) {
                updates.officialDueDate = Timestamp.fromDate(updates.officialDueDate);
            }

            await updateDoc(taskRef, {
                ...updates,
                updatedAt: new Date().toISOString(),
                history: arrayUnion(newHistoryEntry)
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async deleteTask(taskId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await deleteDoc(doc(db, "tasks", taskId));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async reassignTasks(taskIds, newUserId, newUserEmail) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        const user = authService.getCurrentUser();
        const batch = writeBatch(db);
        try {
            taskIds.forEach(id => {
                const taskRef = doc(db, "tasks", id);
                const historyEntry = {
                    timestamp: new Date().toISOString(),
                    action: `İş, ${newUserEmail} kullanıcısına atandı.`,
                    userEmail: user.email
                };
                batch.update(taskRef, {
                    assignedTo_uid: newUserId,
                    assignedTo_email: newUserEmail,
                    updatedAt: new Date().toISOString(),
                    history: arrayUnion(historyEntry)
                });
            });
            await batch.commit();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getAllUsers() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            return { success: true, data: querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// --- YENİ EKLENDİ: Transaction Type Service ---
export const transactionTypeService = {
    collectionRef: collection(db, 'transactionTypes'),

    async addTransactionType(typeData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşlem tipi eklenemez." };
        try {
            const id = typeData.id || generateUUID(); 
            const newType = {
                ...typeData,
                id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await setDoc(doc(this.collectionRef, id), newType);
            return { success: true, data: newType };
        } catch (error) {
            console.error("İşlem tipi eklenirken hata:", error);
            return { success: false, error: error.message };
        }
    },

    async getTransactionTypes() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(this.collectionRef, orderBy('name', 'asc'));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        } catch (error) {
            console.error("İşlem tipleri yüklenirken hata:", error);
            return { success: false, error: error.message, data: [] };
        }
    },

    async getTransactionTypeById(typeId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const docRef = doc(this.collectionRef, typeId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists() ? { success: true, data: { id: docSnap.id, ...docSnap.data() } } : { success: false, error: "İşlem tipi bulunamadı." };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getFilteredTransactionTypes(filters = {}) {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            let q = this.collectionRef;

            if (filters.hierarchy) {
                q = query(q, where('hierarchy', '==', filters.hierarchy));
            }
            if (filters.ipType) {
                q = query(q, where('applicableToMainType', 'array-contains', filters.ipType));
            }
            if (filters.ids && filters.ids.length > 0) {
                q = query(q, where(documentId(), 'in', filters.ids));
            }

            q = query(q, orderBy('name', 'asc')); 

            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
        } catch (error) {
            console.error("Filtrelenmiş işlem tipleri yüklenirken hata:", error);
            return { success: false, error: error.message, data: [] };
        }
    },

    async updateTransactionType(typeId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşlem tipi güncellenemez." };
        try {
            await updateDoc(doc(this.collectionRef, typeId), { ...updates, updatedAt: new Date().toISOString() });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async deleteTransactionType(typeId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. İşlem tipi silinemez." };
        try {
            await deleteDoc(doc(this.collectionRef, typeId));
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// --- Bulk Indexing Service ---
export const bulkIndexingService = {
    collectionRef: collection(db, 'pendingBulkIndexJobs'), // Bu koleksiyonun adını 'unindexed_pdfs' olarak değiştireceğiz
    async addJob(jobData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return { success: false, error: "Kullanıcı girişi yapılmamış." };

        const newJob = { ...jobData, createdAt: new Date().toISOString(), userId: currentUser.uid, userEmail: currentUser.email };
        try {
            await setDoc(doc(this.collectionRef, jobData.jobId), newJob);
            return { success: true, data: newJob };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getPendingJobs(userId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor.", data: [] };
        try {
            const q = query(this.collectionRef, where('userId', '==', userId), orderBy('createdAt', 'asc'));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ jobId: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
        }
    },
    async updateJob(jobId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await updateDoc(doc(this.collectionRef, jobId), updates);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async deleteJob(jobId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            await deleteDoc(doc(this.collectionRef, jobId));
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    },
};

// Tahakkuk ID counter fonksiyonu
async function getNextAccrualId() {
    if (!isFirebaseAvailable) return '1';

    try {
        const counterRef = doc(db, 'counters', 'accruals');

        const counterDoc = await getDoc(counterRef);

        let currentId = 0;

        if (counterDoc.exists()) {
            const data = counterDoc.data();
            if (data && typeof data.lastId === 'number') {
                currentId = data.lastId;
            }
        } else {
            await setDoc(counterRef, { lastId: 0 });
            currentId = 0;
        }

        const nextId = currentId + 1;

        await setDoc(counterRef, { lastId: nextId }, { merge: true });

        return nextId.toString();

    } catch (error) {
        console.error('🔥 Tahakkuk ID üretim hatası:', error);
        return 'error';
    }
}
export async function getNextTaskId() {
    if (!isFirebaseAvailable) return '1';

    try {
        const counterRef = doc(db, 'counters', 'tasks');
        const counterDoc = await getDoc(counterRef);

        let currentId = 0;

        if (counterDoc.exists()) {
            const data = counterDoc.data();
            if (data && typeof data.lastId === 'number') {
                currentId = data.lastId;
            }
        } else {
            await setDoc(counterRef, { lastId: 0 });
            currentId = 0;
        }

        const nextId = currentId + 1;
        await setDoc(counterRef, { lastId: nextId }, { merge: true });

        return nextId.toString();
    } catch (error) {
        console.error('🔥 Task ID üretim hatası:', error);
        return 'error';
    }
}

// --- Accrual Service ---
export const accrualService = {
    async addAccrual(accrualData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor. Tahakkuk eklenemez." };
        const user = authService.getCurrentUser();
        if (!user) return { success: false, error: "Kullanıcı girişi yapılmamış." };
        
        try {
            const accrualId = await getNextAccrualId();
            
            const newAccrual = {
                ...accrualData,
                id: accrualId, 
                status: 'unpaid',
                createdAt: new Date().toISOString(),
                createdBy_uid: user.uid,
                createdBy_email: user.email,
                files: (accrualData.files || []).map(f => ({ ...f, id: f.id || generateUUID() })),
                paymentDate: null
            };
            await setDoc(doc(db, 'accruals', accrualId), newAccrual); 
            return { success: true, data: newAccrual };
        } catch (error) {
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
            return { success: false, error: error.message, data: [] };
        }
    },
    async getAccrualsByTaskId(taskId) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const q = query(collection(db, 'accruals'), where('taskId', '==', taskId), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(d => ({id: d.id, ...d.data()})) };
        } catch (error) {
            return { success: false, error: error.message, data: [] };
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
            const finalUpdates = { ...updates, updatedAt: new Date().toISOString() };
            await updateDoc(accrualRef, finalUpdates);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
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
        const personResult = await personService.addPerson(demoPerson); 
        if (!personResult.success) {
            console.error("Demo kişi oluşturulamadı:", personResult.error);
            return;
        }
        const demoOwner = { 
            id: personResult.data.id, 
            name: personResult.data.name, 
            personType: personResult.data.personType,
            email: demoPersonEmail 
        };

        const demoRecords = [
            {
                type: 'patent',
                title: 'Otomatik Patent Başvurusu',
                applicationNumber: 'TR2023/P12345',
                applicationDate: '2023-01-15',
                status: 'pending',
                description: 'Bu bir demo patent başvurusudur.',
                patentClass: 'A01B',
                owners: [demoOwner],
                recordStatus: 'aktif'
            },
            {
                type: 'trademark',
                title: 'Yaratıcı Marka Tescili',
                applicationNumber: 'TR2023/M67890',
                applicationDate: '2023-03-20',
                status: 'registered',
                description: 'Bu bir demo marka tescilidir.',
                niceClass: '01,05',
                owners: [demoOwner],
                recordStatus: 'aktif',
                trademarkImage: '[https://via.placeholder.com/150/FF0000/FFFFFF?text=Marka](https://via.placeholder.com/150/FF0000/FFFFFF?text=Marka)' 
            },
            {
                type: 'copyright',
                title: 'Dijital Sanat Eseri Telif',
                applicationDate: '2023-05-10',
                status: 'active',
                description: 'Demo telif hakkı kaydı.',
                workType: 'Resim',
                owners: [demoOwner],
                recordStatus: 'aktif'
            },
            {
                type: 'design',
                title: 'Yenilikçi Ürün Tasarımı',
                applicationNumber: 'TR2023/D11223',
                applicationDate: '2023-07-01',
                status: 'approved',
                description: 'Demo tasarım kaydı.',
                designClass: '01.01',
                owners: [demoOwner],
                recordStatus: 'aktif'
            }
        ];

        for (const recordData of demoRecords) {
            const addRecordResult = await ipRecordsService.addRecord(recordData);
            if (!addRecordResult.success) {
                console.error("Demo kayıt oluşturulamadı:", recordData.title, addRecordResult.error);
                continue;
            }
            const newRecordId = addRecordResult.id;

            const applicationTransactionType = transactionTypeService.getTransactionTypes().then(result => {
                if (result.success) {
                    return result.data.find(type => 
                        type.hierarchy === 'parent' && 
                        type.alias === 'Başvuru' && 
                        type.applicableToMainType.includes(recordData.type)
                    );
                }
                return null;
            });

            const initialTransaction = await applicationTransactionType;

            if (initialTransaction) {
                const initialTransactionData = {
                    type: initialTransaction.id, 
                    designation: initialTransaction.alias || initialTransaction.name, 
                    description: `Yeni ${recordData.type} kaydı için başlangıç başvurusu.`,
                    timestamp: new Date(recordData.applicationDate).toISOString(), 
                    transactionHierarchy: 'parent'
                };
                await ipRecordsService.addTransactionToRecord(newRecordId, initialTransactionData);
                console.log(`İlk 'Başvuru' işlemi ${recordData.title} kaydına eklendi.`);
            } else {
                console.warn(`'${recordData.type}' için uygun 'Başvuru' işlem tipi bulunamadı. İlk işlem eklenemedi.`);
            }
        }

        console.log('✅ Demo verisi başarıyla oluşturuldu!');

    } catch (error) {
        console.error('Demo verisi oluşturulurken hata:', error);
    }
}


// --- Exports ---
export {auth, db, FieldValue}; // FieldValue'ı da dışa aktar
export { authService, ipRecordsService, personService, taskService, transactionTypeService, bulkIndexingService, generateUUID, getNextTaskId };
export { firebaseServices }; // Tüm Firebase servislerini içeren obje