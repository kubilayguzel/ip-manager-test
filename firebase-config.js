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
    apiKey: "YOUR_API_KEY",
    authDomain: "ip-manager-production.firebaseapp.com",
    projectId: "ip-manager-production",
    storageBucket: "ip-manager-production.firebasestorage.app",
    messagingSenderId: "378017128708",
    appId: "1:378017128708:web:e2c6fa7b8634022f2ef051",
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

// --- GENERIC HELPER FUNCTIONS for Firestore ---
const genericAdd = async (collectionName, data) => {
    if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
    try {
        const docRef = await addDoc(collection(db, collectionName), { ...data, createdAt: new Date().toISOString() });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error(`Error adding to ${collectionName}:`, error);
        return { success: false, error: error.message };
    }
};

const genericSet = async (collectionName, docId, data) => {
    if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
    try {
        await setDoc(doc(db, collectionName, docId), data, { merge: true });
        return { success: true, id: docId };
    } catch (error) {
        console.error(`Error setting doc in ${collectionName}:`, error);
        return { success: false, error: error.message };
    }
};

const genericUpdate = async (collectionName, docId, updates) => {
    if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
    try {
        await updateDoc(doc(db, collectionName, docId), { ...updates, updatedAt: new Date().toISOString() });
        return { success: true };
    } catch (error) {
        console.error(`Error updating in ${collectionName}:`, error);
        return { success: false, error: error.message };
    }
};

const genericDelete = async (collectionName, docId) => {
    if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
    try {
        await deleteDoc(doc(db, collectionName, docId));
        return { success: true };
    } catch (error) {
        console.error(`Error deleting from ${collectionName}:`, error);
        return { success: false, error: error.message };
    }
};

const genericGetById = async (collectionName, docId) => {
    if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
    try {
        const docSnap = await getDoc(doc(db, collectionName, docId));
        if (docSnap.exists()) {
            return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
        } else {
            return { success: false, error: "Belge bulunamadı." };
        }
    } catch (error) {
        console.error(`Error getting doc by ID from ${collectionName}:`, error);
        return { success: false, error: error.message };
    }
};

// --- Authentication Service (Refactored) ---
export const authService = {
    auth,
    isFirebaseAvailable,
    async getUserRole(uid) {
        if (!isFirebaseAvailable) return 'user';
        const result = await genericGetById('users', uid);
        return result.success ? result.data.role : 'user';
    },
    async setUserRole(uid, email, displayName, role) {
        const userData = { email, displayName, role, createdAt: new Date().toISOString() };
        return genericSet('users', uid, userData);
    },
    async signIn(email, password) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase bağlantısı yok."};
        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            const user = result.user;
            const role = await this.getUserRole(user.uid);
            const userData = { uid: user.uid, email: user.email, displayName: user.displayName, role, isSuperAdmin: role === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData };
        } catch (error) {
            console.error("Giriş hatası:", error);
            return { success: false, error: "Hatalı e-posta veya şifre." };
        }
    },
    async signUp(email, password, displayName, initialRole = 'user') {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase bağlantısı yok."};
        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            const user = result.user;
            await updateProfile(user, { displayName });
            await this.setUserRole(user.uid, email, displayName, initialRole);
            const userData = { uid: user.uid, email, displayName, role: initialRole, isSuperAdmin: initialRole === 'superadmin' };
            localStorage.setItem('currentUser', JSON.stringify(userData));
            return { success: true, user: userData };
        } catch (error) {
            console.error("Kayıt hatası:", error);
            return { success: false, error: error.message };
        }
    },
    async signOut() {
        if (isFirebaseAvailable) await signOut(auth);
        localStorage.removeItem('currentUser');
    },
    getCurrentUser() {
        const localData = localStorage.getItem('currentUser');
        return localData ? JSON.parse(localData) : null;
    }
};

// --- Persons Service (Refactored) ---
export const personsService = {
    addPerson: (data) => genericAdd('persons', data),
    getPersons: async () => {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, "persons"), orderBy("name"));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    updatePerson: (id, updates) => genericUpdate('persons', id, updates),
    deletePerson: (id) => genericDelete('persons', id),
};

// --- IP Records Service (Refactored) ---
export const ipRecordsService = {
    addRecord: (data) => genericAdd('ipRecords', { ...data, transactions: [], files: [] }),
    getRecordById: (id) => genericGetById('ipRecords', id),
    updateRecord: (id, updates) => genericUpdate('ipRecords', id, updates),
    deleteRecord: (id) => genericDelete('ipRecords', id),
    async getRecords() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'ipRecords'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
};

// --- Task Service (Refactored) ---
export const taskService = {
    createTask: (data) => genericAdd('tasks', { ...data, history: [] }),
    getTaskById: (id) => genericGetById('tasks', id),
    deleteTask: (id) => genericDelete('tasks', id),
    async updateTask(taskId, updates) {
        if (!isFirebaseAvailable) return { success: false, error: "Firebase kullanılamıyor." };
        try {
            const user = authService.getCurrentUser();
            const actionMessage = `İş, ${user.email} tarafından güncellendi.`;
            const updateAction = { timestamp: new Date().toISOString(), userId: user.uid, userEmail: user.email, action: actionMessage };
            const finalUpdates = { ...updates, updatedAt: new Date().toISOString(), history: arrayUnion(updateAction) };
            await updateDoc(doc(db, "tasks", taskId), finalUpdates);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },
    async getAllTasks() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

// --- Accrual Service (Refactored) ---
export const accrualService = {
    addAccrual: (data) => genericAdd('accruals', { ...data, status: 'unpaid', paymentDate: null }),
    updateAccrual: (id, updates) => genericUpdate('accruals', id, updates),
    async getAccruals() {
        if (!isFirebaseAvailable) return { success: true, data: [] };
        try {
            const q = query(collection(db, "accruals"), orderBy("createdAt", "desc"));
            const snapshot = await getDocs(q);
            return { success: true, data: snapshot.docs.map(d => ({ id: d.id, ...d.data() })) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

export { auth, db };