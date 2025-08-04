// js/services/nice-classification-service.js
// Nice Classification Firebase servisleri

import { db } from '../firebase-config.js';
import { 
    collection, 
    doc, 
    getDocs, 
    getDoc, 
    setDoc, 
    updateDoc, 
    query, 
    orderBy, 
    where 
} from 'firebase/firestore';

export const niceClassificationService = {
    
    // Tüm Nice sınıflarını getir (1-45 + 99)
    async getAllClasses() {
        try {
            const classesRef = collection(db, 'niceClassification');
            const q = query(classesRef, orderBy('classNumber'));
            const snapshot = await getDocs(q);
            
            const classes = {};
            snapshot.forEach(doc => {
                classes[doc.id] = { id: doc.id, ...doc.data() };
            });
            
            return { success: true, data: classes };
        } catch (error) {
            console.error('Nice sınıfları alınırken hata:', error);
            return { success: false, error: error.message };
        }
    },

    // Aktif sınıfları getir
    async getActiveClasses() {
        try {
            const classesRef = collection(db, 'niceClassification');
            const q = query(classesRef, orderBy('classNumber'));
            const snapshot = await getDocs(q);
            
            const classes = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                // isActive alanı varsa kontrol et, yoksa aktif kabul et
                if (data.isActive !== false) {
                    classes[doc.id] = { id: doc.id, ...data };
                }
            });
            
            return { success: true, data: classes };
        } catch (error) {
            console.error('Aktif Nice sınıfları alınırken hata:', error);
            return { success: false, error: error.message };
        }
    },

    // Belirli bir sınıfı getir
    async getClass(classNumber) {
        try {
            const classRef = doc(db, 'niceClassification', classNumber);
            const docSnap = await getDoc(classRef);
            
            if (docSnap.exists()) {
                return { success: true, data: { id: docSnap.id, ...docSnap.data() } };
            } else {
                return { success: false, error: 'Sınıf bulunamadı' };
            }
        } catch (error) {
            console.error('Nice sınıfı alınırken hata:', error);
            return { success: false, error: error.message };
        }
    },

    // Sınıf arama
    async searchClasses(searchTerm) {
        try {
            const classesRef = collection(db, 'niceClassification');
            const snapshot = await getDocs(classesRef);
            
            const results = [];
            const lowerSearchTerm = searchTerm.toLowerCase();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                const titleMatch = data.classTitle?.toLowerCase().includes(lowerSearchTerm);
                const descriptionMatch = data.description?.toLowerCase().includes(lowerSearchTerm);
                const classNumberMatch = data.classNumber?.includes(searchTerm);
                
                // Alt sınıflarda arama
                const subclassMatch = data.subClasses?.some(sub => 
                    sub.subClassDescription?.toLowerCase().includes(lowerSearchTerm) ||
                    sub.subClassNumber?.toLowerCase().includes(lowerSearchTerm)
                );
                
                if (titleMatch || descriptionMatch || classNumberMatch || subclassMatch) {
                    results.push({ id: doc.id, ...data });
                }
            });
            
            return { success: true, data: results };
        } catch (error) {
            console.error('Nice sınıfları aranırken hata:', error);
            return { success: false, error: error.message };
        }
    },

    // Task'a seçili sınıfları kaydet
    async saveSelectedClassesToTask(taskId, selectedClasses) {
        try {
            const taskRef = doc(db, 'tasks', taskId);
            
            const niceClassesData = selectedClasses.map(item => ({
                classNumber: item.classNumber,
                subCode: item.subCode || null,
                description: item.description,
                isCustom: item.isCustom || false,
                selectedAt: new Date()
            }));
            
            await updateDoc(taskRef, {
                niceClasses: niceClassesData,
                updatedAt: new Date()
            });
            
            return { success: true };
        } catch (error) {
            console.error('Seçili sınıflar kaydedilirken hata:', error);
            return { success: false, error: error.message };
        }
    },

    // Task'ın seçili sınıflarını getir
    async getTaskClasses(taskId) {
        try {
            const taskRef = doc(db, 'tasks', taskId);
            const docSnap = await getDoc(taskRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                return { 
                    success: true, 
                    data: data.niceClasses || [] 
                };
            } else {
                return { success: false, error: 'Task bulunamadı' };
            }
        } catch (error) {
            console.error('Task sınıfları alınırken hata:', error);
            return { success: false, error: error.message };
        }
    },

    // Yeni sınıf oluştur veya güncelle (Admin işlemi)
    async saveClass(classNumber, classData) {
        try {
            const classRef = doc(db, 'niceClassification', classNumber);
            const dataToSave = {
                ...classData,
                classNumber,
                updatedAt: new Date()
            };
            
            await setDoc(classRef, dataToSave, { merge: true });
            return { success: true };
        } catch (error) {
            console.error('Nice sınıfı kaydedilirken hata:', error);
            return { success: false, error: error.message };
        }
    }
};

// Cache yönetimi için basit bir sistem
export class NiceClassificationCache {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 dakika
    }

    getFromCache(classNumber) {
        const cached = this.cache.get(classNumber);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    addToCache(classNumber, data) {
        this.cache.set(classNumber, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    async cacheAllClasses() {
        try {
            const result = await niceClassificationService.getAllClasses();
            if (result.success) {
                Object.keys(result.data).forEach(classNumber => {
                    this.addToCache(classNumber, result.data[classNumber]);
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Cache yüklenirken hata:', error);
            return false;
        }
    }
}

export const niceClassificationCache = new NiceClassificationCache();