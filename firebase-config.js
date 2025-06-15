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
}

// --- Helper Functions & Constants ---
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const subDesignationTranslations = {
    'opposition_to_publication': 'Yayına İtiraz',
    'response_to_opposition': 'İtiraza Karşı Görüş',
    'opposition_decision_rejected': 'Yayına İtiraz Kararı - Ret',
    'opposition_decision_accepted': 'Yayına İtiraz Kararı - Kabul'
};

const documentDesignationTranslations = {
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
    'Genel Not': 'Genel Not'
};

// --- Task Type Definitions ---
export const taskTypeDefinitions = {
    // Ana kategoriler
    categories: {
        'patent': 'Patent İşleri',
        'trademark': 'Marka İşleri', 
        'copyright': 'Telif İşleri',
        'design': 'Tasarım İşleri',
        'legal': 'Hukuki İşler',
        'administrative': 'İdari İşler'
    },
    
    // Türkçe iş türleri
    types: {
        // Patent İşleri
        'Patent Başvuru': { category: 'patent', label: 'Patent Başvuru' },
        'Patent Yenileme': { category: 'patent', label: 'Patent Yenileme' },
        'Patent Araştırma': { category: 'patent', label: 'Patent Araştırma' },
        'Patent İtiraz': { category: 'patent', label: 'Patent İtiraz' },
        
        // Marka İşleri
        'Marka Başvuru': { category: 'trademark', label: 'Marka Başvuru' },
        'Marka Yenileme': { category: 'trademark', label: 'Marka Yenileme' },
        'Marka İtiraz': { category: 'trademark', label: 'Marka İtiraz' },
        'Marka Araştırma': { category: 'trademark', label: 'Marka Araştırma' },
        
        // Telif İşleri
        'Telif Başvuru': { category: 'copyright', label: 'Telif Başvuru' },
        'Telif Yenileme': { category: 'copyright', label: 'Telif Yenileme' },
        
        // Tasarım İşleri
        'Tasarım Başvuru': { category: 'design', label: 'Tasarım Başvuru' },
        'Tasarım Yenileme': { category: 'design', label: 'Tasarım Yenileme' },
        
        // Hukuki İşler
        'Hukuki - Devir': { category: 'legal', label: 'Hukuki - Devir' },
        'Hukuki - Lisans': { category: 'legal', label: 'Hukuki - Lisans' },
        'Hukuki - Rehin': { category: 'legal', label: 'Hukuki - Rehin' },
        'Hukuki - Birleşme': { category: 'legal', label: 'Hukuki - Birleşme' },
        'Hukuki - Veraset': { category: 'legal', label: 'Hukuki - Veraset' },
        'Hukuki - Teminat': { category: 'legal', label: 'Hukuki - Teminat' },
        
        // İdari İşler
        'İdari - Genel': { category: 'administrative', label: 'İdari - Genel' },
        'İdari - Belgelendirme': { category: 'administrative', label: 'İdari - Belgelendirme' },
        'İdari - Yazışma': { category: 'administrative', label: 'İdari - Yazışma' }
    },
    
    // Geriye uyumluluk için eski kodlar
    legacyMapping: {
        'patent_application': 'Patent Başvuru',
        'patent_renewal': 'Patent Yenileme',
        'trademark_application': 'Marka Başvuru',
        'trademark_renewal': 'Marka Yenileme',
        'trademark_opposition': 'Marka İtiraz',
        'copyright_application': 'Telif Başvuru',
        'design_application': 'Tasarım Başvuru',
        'design_renewal': 'Tasarım Yenileme',
        'legal_devir': 'Hukuki - Devir',
        'legal_lisans': 'Hukuki - Lisans',
        'legal_rehin': 'Hukuki - Rehin',
        'legal_birleşme': 'Hukuki - Birleşme',
        'legal_veraset': 'Hukuki - Veraset',
        'legal_teminat': 'Hukuki - Teminat',
        'administrative_general': 'İdari - Genel',
        'administrative_documentation': 'İdari - Belgelendirme'
    },

    // İş türü validasyonu
    isValidTaskType(taskType) {
        return this.types.hasOwnProperty(taskType) || this.legacyMapping.hasOwnProperty(taskType);
    },

    // İş türünü normalize et
    normalizeTaskType(taskType) {
        if (this.types.hasOwnProperty(taskType)) {
            return taskType; // Zaten Türkçe
        }
        if (this.legacyMapping.hasOwnProperty(taskType)) {
            return this.legacyMapping[taskType]; // Eski kodu Türkçe'ye çevir
        }
        return taskType; // Bilinmeyen türü olduğu gibi döndür
    },

    // Kategoriye göre türleri getir
    getTypesByCategory(category) {
        return Object.entries(this.types)
            .filter(([_, typeInfo]) => typeInfo.category === category)
            .map(([typeName, typeInfo]) => ({ value: typeName, label: typeInfo.label }));
    },

    // Tüm türleri getir
    getAllTypes() {
        return Object.entries(this.types).map(([typeName, typeInfo]) => ({
            value: typeName,
            label: typeInfo.label,
            category: typeInfo.category
        }));
    }
};

// --- Task Status Definitions ---
export const taskStatusDefinitions = {
    statuses: {
        'open': { label: 'Açık', color: '#007bff' },
        'in_progress': { label: 'Devam Ediyor', color: '#ffc107' },
        'pending_review': { label: 'Gözden Geçiriliyor', color: '#fd7e14' },
        'completed': { label: 'Tamamlandı', color: '#28a745' }
    },

    getStatusLabel(status) {
        return this.statuses[status]?.label || status;
    },

    getStatusColor(status) {
        return this.statuses[status]?.color || '#6c757d';
    },

    getAllStatuses() {
        return Object.entries(this.statuses).map(([value, info]) => ({
            value,
            label: info.label,
            color: info.color
        }));
    }
};

// --- Authentication Service ---
export const authService = {
    auth: auth,
    isFirebaseAvailable: isFirebaseAvailable,
    async getUserRole(uid) {
        if (!this.isFirebaseAvailable) return null;
        try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            return userDoc.exists() ? userDoc.data().role : null;
        } catch (error) {
            console.error("Error getting user role:", error);
            return null;
        }
    },
    async setUserRole(uid, email, displayName, role) {
        if (!this.isFirebaseAvailable) return false;
        try {
            await setDoc(doc(db, 'users', uid), {
                email, displayName, role,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error("Error setting user role:", error);
            return false;
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
            return { success: true, user: userData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async signUp(email, password, displayName, initialRole = 'user') {
        if (!isFirebaseAvailable) return this.localSignUp(email, password, displayName, initialRole);
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            const user = result.user;
            await updateProfile(user, { displayName });
            await this.setUserRole(user.uid, email, displayName, initialRole);
            const userData = { uid: user.uid, email, displayName, role: initialRole, isSuperAdmin: initialRole === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async signOut() {
        if (isFirebaseAvailable) await signOut(auth);
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
            return { success: true, user: userData };
        }
        return { success: false, error: 'Invalid credentials' };
    },
    localSignUp(email, password, displayName, initialRole) {
        const userData = { uid: `local_${Date.now()}`, email, displayName, role: initialRole, isSuperAdmin: initialRole === 'superadmin' };
        localStorage.setItem('currentUser', JSON.stringify(userData));
        return { success: true, user: userData };
    }
};

// --- Persons Service ---
export const personsService = {
    async addPerson(personData) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Not logged in"};
        const newPerson = { ...personData, id: generateUUID(), userId: user.uid, userEmail: user.email, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (isFirebaseAvailable) {
            await setDoc(doc(db, 'persons', newPerson.id), newPerson);
        } else {
            const persons = JSON.parse(localStorage.getItem('persons') || '[]');
            persons.push(newPerson);
            localStorage.setItem('persons', JSON.stringify(persons));
        }
        return { success: true, data: newPerson };
    },
    async getPersons() {
        if (isFirebaseAvailable) {
            const user = authService.getCurrentUser();
            if(!user) return {success: true, data:[]};
            const q = user.role === 'superadmin' ? query(collection(db, 'persons'), orderBy('name')) : query(collection(db, 'persons'), where('userId', '==', user.uid), orderBy('name'));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        }
        return { success: true, data: JSON.parse(localStorage.getItem('persons') || '[]') };
    },
    async updatePerson(personId, updates) {
        updates.updatedAt = new Date().toISOString();
        if (isFirebaseAvailable) {
            await updateDoc(doc(db, 'persons', personId), updates);
        } else {
            let persons = JSON.parse(localStorage.getItem('persons') || '[]');
            const index = persons.findIndex(p => p.id === personId);
            if (index > -1) persons[index] = { ...persons[index], ...updates };
            localStorage.setItem('persons', JSON.stringify(persons));
        }
        return { success: true };
    },
    async deletePerson(personId) {
        if (isFirebaseAvailable) {
            await deleteDoc(doc(db, 'persons', personId));
        } else {
            let persons = JSON.parse(localStorage.getItem('persons') || '[]').filter(p => p.id !== personId);
            localStorage.setItem('persons', JSON.stringify(persons));
        }
        return { success: true };
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
        if(!user) return {success: false, error: "Not logged in"};
        const timestamp = new Date().toISOString();
        const newRecord = { ...record, userId: user.uid, userEmail: user.email, createdAt: timestamp, updatedAt: timestamp, transactions: [], files: (record.files || []).map(f => ({ ...f, id: generateUUID() })) };
        
        if (isFirebaseAvailable) {
            const docRef = await addDoc(collection(db, 'ipRecords'), newRecord);
            return { success: true, id: docRef.id };
        }
        const records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
        newRecord.id = generateUUID();
        records.push(newRecord);
        localStorage.setItem('ipRecords', JSON.stringify(records));
        return { success: true, id: newRecord.id };
    },
    async addTransactionToRecord(recordId, transactionData) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Not logged in"};
        if (!isFirebaseAvailable) return { success: false, error: "Firebase not connected." };
        
        try {
            const recordRef = doc(db, 'ipRecords', recordId);
            const currentDoc = await getDoc(recordRef);
            if (!currentDoc.exists()) return { success: false, error: "Record not found" };

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
            console.error("Error adding transaction to record:", error);
            return { success: false, error: error.message };
        }
    },
    async getRecords() {
        if (isFirebaseAvailable) {
            const user = authService.getCurrentUser();
            if(!user) return {success: true, data:[]};
            const q = user.role === 'superadmin' ? query(collection(db, 'ipRecords'), orderBy('createdAt', 'desc')) : query(collection(db, 'ipRecords'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        }
        return { success: true, data: JSON.parse(localStorage.getItem('ipRecords') || '[]') };
    },
    async updateRecord(recordId, updates) {
        const user = authService.getCurrentUser();
        if(!user) return {success: false, error: "Not logged in"};
        const timestamp = new Date().toISOString();
        if (isFirebaseAvailable) {
            const recordRef = doc(db, 'ipRecords', recordId);
            const currentDoc = await getDoc(recordRef);
            if (!currentDoc.exists()) return { success: false, error: "Record not found" };
            const currentData = currentDoc.data();
            let newTransactions = [...(currentData.transactions || [])]; 

            const existingFileIds = new Set((currentData.files || []).map(f => f.id));
            (updates.files || []).forEach(newFile => {
                if (!existingFileIds.has(newFile.id)) { 
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
                }
            });
            
            const updatedFiles = updates.files !== undefined ? updates.files : currentData.files;

            await updateDoc(recordRef, { 
                ...updates, 
                files: updatedFiles,
                updatedAt: timestamp, 
                transactions: newTransactions 
            });
        } else {
            let records = JSON.parse(localStorage.getItem('ipRecords') || '[]');
            let record = records.find(r => r.id === recordId);
            if (record) {
                Object.assign(record, updates, { updatedAt: timestamp });
                localStorage.setItem('ipRecords', JSON.stringify(records));
            }
        }
        return { success: true };
    },
    async deleteRecord(recordId) {
        if (isFirebaseAvailable) {
            await deleteDoc(doc(db, 'ipRecords', recordId));
        } else {
            const records = JSON.parse(localStorage.getItem('ipRecords') || '[]').filter(r => r.id !== recordId);
            localStorage.setItem('ipRecords', JSON.stringify(records));
        }
        return { success: true };
    },
    async deleteTransaction(recordId, txId) {
        if (isFirebaseAvailable) {
            const recordRef = doc(db, 'ipRecords', recordId);
            const currentDoc = await getDoc(recordRef);
            if (!currentDoc.exists()) return { success: false, error: "Record not found" };
            const transactions = currentDoc.data().transactions || [];
            const idsToDelete = new Set([txId, ...this.findAllDescendants(txId, transactions)]);
            const newTransactions = transactions.filter(tx => !idsToDelete.has(tx.transactionId));
            await updateDoc(recordRef, { transactions: newTransactions });
            return { success: true, remainingTransactions: newTransactions };
        }
        return { success: false, error: 'Local mode not supported' };
    },
    async updateTransaction(recordId, txId, updates) {
        if (isFirebaseAvailable) {
            const recordRef = doc(db, 'ipRecords', recordId);
            const currentDoc = await getDoc(recordRef);
            if (!currentDoc.exists()) return { success: false, error: "Record not found" };
            const transactions = currentDoc.data().transactions || [];
            const newTransactions = transactions.map(tx => tx.transactionId === txId ? { ...tx, ...updates, timestamp: new Date().toISOString() } : tx);
            await updateDoc(recordRef, { transactions: newTransactions });
            return { success: true };
        }
        return { success: false, error: 'Local mode not supported' };
    }
};

// --- Task Service (For Workflow Management) ---
export const taskService = {
    async createTask(taskData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase not connected." };
        try {
            const user = authService.getCurrentUser();
            
            // İş türünü normalize et (eski kodları Türkçe'ye çevir)
            const normalizedTaskType = taskTypeDefinitions.normalizeTaskType(taskData.taskType);
            
            // İş türü validasyonu
            if (!taskTypeDefinitions.isValidTaskType(taskData.taskType)) {
                console.warn(`Geçersiz iş türü: ${taskData.taskType}, normalize ediliyor...`);
            }
            
            const docRef = await addDoc(collection(db, 'tasks'), {
                ...taskData,
                taskType: normalizedTaskType, // Normalize edilmiş tür
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
            console.error("Error creating task:", error);
            return { success: false, error: error.message };
        }
    },
    
    async updateTask(taskId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase not connected." };
        try {
            const taskRef = doc(db, "tasks", taskId);
            const user = authService.getCurrentUser();
            
            // İş türü güncellenmişse normalize et
            if (updates.taskType) {
                updates.taskType = taskTypeDefinitions.normalizeTaskType(updates.taskType);
            }
            
            let actionMessage = `İş güncellendi.`;
            if (updates.status) {
                const statusLabel = taskStatusDefinitions.getStatusLabel(updates.status);
                actionMessage = `İş durumu "${statusLabel}" olarak güncellendi.`;
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
            if (updates.files) {
                updatedFilesArray = updates.files;
                delete updates.files;
            }

            await updateDoc(taskRef, {
                ...updates,
                files: updatedFilesArray,
                updatedAt: new Date().toISOString(),
                history: arrayUnion(updateAction)
            });
            return { success: true };
        } catch (error) {
            console.error("Error updating task:", error);
            return { success: false, error: error.message };
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
            console.error("Error fetching tasks for user:", error);
            return { success: false, error: error.message, data: [] };
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
            console.error("Error fetching all tasks:", error);
            return { success: false, error: error.message, data: [] };
        }
    },

    async getTaskById(taskId) {
        if (!isFirebaseAvailable) {
            const allTasks = JSON.parse(localStorage.getItem('tasks') || '[]');
            const task = allTasks.find(t => t.id === taskId);
            return { success: !!task, data: task };
        }
        try {
            const taskDoc = await getDoc(doc(db, 'tasks', taskId));
            if (taskDoc.exists()) {
                return { success: true, data: { id: taskDoc.id, ...taskDoc.data() } };
            } else {
                return { success: false, error: "Task not found" };
            }
        } catch (error) {
            console.error("Error fetching task by ID:", error);
            return { success: false, error: error.message };
        }
    },

    async deleteTask(taskId) {
        if (!isFirebaseAvailable) {
            let tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
            const taskToDelete = tasks.find(t => t.id === taskId);
            if (taskToDelete && taskToDelete.relatedIpRecordId && taskToDelete.transactionIdForDeletion) {
                await ipRecordsService.deleteTransaction(taskToDelete.relatedIpRecordId, taskToDelete.transactionIdForDeletion);
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
            console.error("Error deleting task:", error);
            return { success: false, error: error.message };
        }
    },
    
    async reassignTasks(taskIds, newUserId, newUserEmail) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase not connected." };
        
        const user = authService.getCurrentUser();
        if (!user) return { success: false, error: "Not logged in" };

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
            console.error("Error reassigning tasks in batch:", error);
            return { success: false, error: error.message };
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
            console.error("Error fetching all users:", error);
            return { success: false, error: error.message, data: [] };
        }
    },

    // İş türü yardımcı metodları
    getTaskTypesByCategory(category) {
        return taskTypeDefinitions.getTypesByCategory(category);
    },

    getAllTaskTypes() {
        return taskTypeDefinitions.getAllTypes();
    },

    validateTaskType(taskType) {
        return taskTypeDefinitions.isValidTaskType(taskType);
    },

    normalizeTaskType(taskType) {
        return taskTypeDefinitions.normalizeTaskType(taskType);
    }
};

// --- Accrual Service ---
export const accrualService = {
    async addAccrual(accrualData) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase not connected." };
        const user = authService.getCurrentUser();
        if (!user) return { success: false, error: "Not logged in" };
        
        try {
            const newAccrual = {
                ...accrualData,
                id: generateUUID(),
                status: 'unpaid', // Default status
                createdAt: new Date().toISOString(),
                createdBy_uid: user.uid,
                createdBy_email: user.email,
            };
            await setDoc(doc(db, 'accruals', newAccrual.id), newAccrual);
            return { success: true, data: newAccrual };
        } catch (error) {
            console.error("Error creating accrual:", error);
            return { success: false, error: error.message };
        }
    },

    async getAccruals() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'accruals'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            return { success: true, data: querySnapshot.docs.map(d => d.data()) };
        } catch (error) {
            console.error("Error fetching accruals:", error);
            return { success: false, error: error.message, data: [] };
        }
    },

    async updateAccrual(accrualId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase not connected." };
        try {
            const accrualRef = doc(db, 'accruals', accrualId);
            await updateDoc(accrualRef, updates);
            return { success: true };
        } catch (error) {
            console.error("Error updating accrual:", error);
            return { success: false, error: error.message };
        }
    }
};

// --- Demo Data Function ---
export async function createDemoData() {
    console.log('🧪 Creating demo data...');
    const user = authService.getCurrentUser();
    if (!user) {
        console.error('No user logged in to create demo data for.');
        return;
    }

    try {
        const demoPerson = {
            name: 'Demo Hak Sahibi',
            type: 'individual',
            email: `demo.owner.${Date.now()}@example.com`,
            phone: '0555 123 4567',
            address: 'Demo Adres, No:1, İstanbul'
        };
        const personResult = await personsService.addPerson(demoPerson);
        if (!personResult.success) {
            console.error("Failed to create demo person:", personResult.error);
            return;
        }
        const demoOwner = { id: personResult.data.id, name: personResult.data.name, type: personResult.data.type };

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
            }
        ];

        for (const record of demoRecords) {
            await ipRecordsService.addRecord(record);
        }

        // Demo task oluştur
        const demoTasks = [
            {
                title: 'Patent Başvuru İncelemesi',
                description: 'Yeni patent başvurusunun teknik incelemesi yapılacak',
                taskType: 'Patent Başvuru', // Türkçe iş türü
                priority: 'high',
                status: 'open',
                assignedTo_uid: user.uid,
                assignedTo_email: user.email,
                dueDate: '2024-12-31',
                relatedIpRecordId: null
            },
            {
                title: 'Marka Yenileme İşlemi', 
                description: 'Tescilli markanın yenileme işlemleri başlatılacak',
                taskType: 'Marka Yenileme', // Türkçe iş türü
                priority: 'medium',
                status: 'in_progress',
                assignedTo_uid: user.uid,
                assignedTo_email: user.email,
                dueDate: '2025-01-15',
                relatedIpRecordId: null
            }
        ];

        for (const taskData of demoTasks) {
            await taskService.createTask(taskData);
        }

        console.log('✅ Demo data created successfully with Turkish task types!');

    } catch (error) {
        console.error('Error creating demo data:', error);
    }
}

// --- Exports ---
export { subDesignationTranslations, documentDesignationTranslations, taskTypeDefinitions, taskStatusDefinitions };
export { auth, db, generateUUID };